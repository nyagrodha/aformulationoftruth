/**
 * Reading profiles.
 *
 * fresh_profiles has existed since migration 006 and until now NOTHING HAS EVER
 * READ IT. The only statement touching the table in the whole codebase is the
 * upsert in routes/api/profile.ts, there is no /p/[handle] route, and the table
 * holds zero rows in production. The write half was built and the read half
 * never was, so a profile has so far been somewhere to put a handle and nowhere
 * to see one.
 *
 * This module is that missing half.
 *
 * WHY THIS TABLE MAY HOLD PLAINTEXT, when nothing else here does
 *
 * 006_profiles.sql states it directly: "Only content a visitor deliberately
 * publishes lives here, so handle / display_name / bio_public are plaintext by
 * design." Publication is the point -- a handle nobody can read is not a handle.
 * That reasoning covers this table and does not extend to message bodies, which
 * are sealed in the browser and stored as ciphertext.
 *
 * VISIBILITY AND OPT-IN ARE DIFFERENT QUESTIONS
 *
 *   visibility='public'      -> may be listed in the directory
 *   accepts_anonymous_mail   -> may be sent a message
 *
 * They are independent on purpose. A profile can be listed and closed to mail,
 * or unlisted and open to it for people who already know the handle. Conflating
 * them would make "let me be found" and "let anyone write to me" the same
 * decision, which they are not.
 *
 * Zero-logging: this module logs nothing. A handle is chosen for publication,
 * but an email_hash is not, and the two travel together here.
 */

import { withConnection } from './db.ts';

export interface Profile {
  emailHash: string;
  handle: string | null;
  displayName: string | null;
  bio: string | null;
  visibility: 'private' | 'public';
  acceptsMail: boolean;
  createdAt: Date;
}

interface ProfileRow {
  email_hash: string;
  handle: string | null;
  display_name: string | null;
  bio_public: string | null;
  visibility: string;
  accepts_anonymous_mail: boolean;
  created_at: Date;
}

function toProfile(row: ProfileRow): Profile {
  return {
    emailHash: row.email_hash,
    handle: row.handle,
    displayName: row.display_name,
    bio: row.bio_public,
    visibility: row.visibility === 'public' ? 'public' : 'private',
    acceptsMail: row.accepts_anonymous_mail,
    createdAt: row.created_at,
  };
}

const COLUMNS = 'email_hash, handle, display_name, bio_public, visibility, accepts_anonymous_mail, created_at';

/** The profile behind an identity, whether or not it is public. */
export async function getProfile(emailHash: string): Promise<Profile | null> {
  return await withConnection(async (client) => {
    const { rows } = await client.queryObject<ProfileRow>(
      `SELECT ${COLUMNS} FROM fresh_profiles WHERE email_hash = $1`,
      [emailHash],
    );
    return rows.length ? toProfile(rows[0]) : null;
  });
}

/**
 * Look up a profile by handle.
 *
 * Reachable whether or not the profile is listed: the directory decision and
 * the addressability decision are separate, and a handle someone hands out
 * should resolve for whoever was handed it. Callers that must not expose an
 * unlisted profile check `visibility` themselves.
 *
 * Handles are stored lowercase by routes/api/profile.ts, which lowercases in
 * its Zod schema. Lowercasing again here means a link typed with capitals still
 * resolves rather than 404ing on a difference the user cannot see.
 */
export async function getProfileByHandle(handle: string): Promise<Profile | null> {
  const normalized = handle.trim().toLowerCase();
  if (!normalized) return null;

  return await withConnection(async (client) => {
    const { rows } = await client.queryObject<ProfileRow>(
      `SELECT ${COLUMNS} FROM fresh_profiles WHERE handle = $1`,
      [normalized],
    );
    return rows.length ? toProfile(rows[0]) : null;
  });
}

/**
 * The directory: profiles that chose to be listed.
 *
 * Requires a handle as well as public visibility. A public profile without one
 * cannot be linked to, so listing it would render a row that goes nowhere --
 * routes/api/profile.ts already refuses that combination on write, and this is
 * the matching guard on read for any row that predates it.
 *
 * Keyset pagination on (created_at, email_hash) rather than OFFSET: the tie
 * break matters because two profiles created in the same transaction share a
 * timestamp, and an unstable sort silently drops or repeats them across pages.
 *
 * The cursor is therefore BOTH columns, and the predicate compares the same
 * tuple the ORDER BY sorts on. It used to be `created_at < $1` alone, against
 * an ORDER BY of (created_at, email_hash) -- which is the bug the paragraph
 * above describes, still present in the code that describes it. With a
 * timestamp-only cursor, every profile sharing the last row's timestamp is
 * skipped on the next page: the batch created in one transaction is exactly
 * the group that vanishes, and it vanishes silently.
 */
export interface ProfileCursor {
  createdAt: Date;
  emailHash: string;
}

export async function listPublicProfiles(
  opts: { limit?: number; before?: ProfileCursor } = {},
): Promise<Profile[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);

  return await withConnection(async (client) => {
    const { rows } = opts.before
      ? await client.queryObject<ProfileRow>(
        /*
         * Row-value comparison, so the tuple is compared left to right in one
         * step and matches the ORDER BY exactly. Writing it as
         * `created_at < $1 OR (created_at = $1 AND email_hash < $2)` means the
         * same thing and invites the next edit to change one half only.
         */
        `SELECT ${COLUMNS} FROM fresh_profiles
          WHERE visibility = 'public' AND handle IS NOT NULL
            AND (created_at, email_hash) < ($1, $2)
          ORDER BY created_at DESC, email_hash DESC
          LIMIT $3`,
        [opts.before.createdAt, opts.before.emailHash, limit],
      )
      : await client.queryObject<ProfileRow>(
        `SELECT ${COLUMNS} FROM fresh_profiles
          WHERE visibility = 'public' AND handle IS NOT NULL
          ORDER BY created_at DESC, email_hash DESC
          LIMIT $1`,
        [limit],
      );
    return rows.map(toProfile);
  });
}

/**
 * Profiles for a set of identities, in one round trip.
 *
 * Thread lists render a name per correspondent, so the per-row alternative is a
 * query per thread. Returned as a Map because callers are joining, not
 * iterating, and an array would put the ordering burden on every one of them.
 */
export async function getProfilesFor(emailHashes: string[]): Promise<Map<string, Profile>> {
  const unique = [...new Set(emailHashes)].filter(Boolean);
  if (unique.length === 0) return new Map();

  return await withConnection(async (client) => {
    const { rows } = await client.queryObject<ProfileRow>(
      `SELECT ${COLUMNS} FROM fresh_profiles WHERE email_hash = ANY($1)`,
      [unique],
    );
    return new Map(rows.map((r) => [r.email_hash, toProfile(r)]));
  });
}

/**
 * What to call someone.
 *
 * Falls back through display name, handle, then a fixed string -- never to
 * anything derived from the identity. An email_hash rendered as a name would
 * publish a value the rest of the schema works to keep unpublished, and it is
 * stable across the whole site, so it would correlate a person's every
 * appearance.
 */
export function profileLabel(profile: Profile | null | undefined): string {
  if (!profile) return 'someone';
  return profile.displayName?.trim() || profile.handle?.trim() || 'someone';
}
