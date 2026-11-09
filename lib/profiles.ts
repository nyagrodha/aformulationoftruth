/**
 * Profiles: reading them, and the one place they are written.
 *
 * Every read and write of fresh_profiles goes through this module. The routes
 * that use it are /people (the directory), /p/[handle] (one profile, by handle
 * or by private link), /profile-create (create, edit, delete) and
 * /api/profile (the same writes for scripted clients).
 *
 * WHY THIS TABLE MAY HOLD PLAINTEXT, when nothing else here does
 *
 * 006_profiles.sql states it directly: "Only content a visitor deliberately
 * publishes lives here, so handle / display_name / bio_public are plaintext by
 * design." Publication is the point -- a handle nobody can read is not a handle.
 * That reasoning covers this table and does not extend to message bodies, which
 * are sealed in the browser and stored as ciphertext.
 *
 * HOW A PROFILE IS REACHED
 *
 *   visibility='public'   -> listed in /people, and served at /p/<handle>
 *   visibility='private'  -> not listed, 404 at /p/<handle> (indistinguishable
 *                            from a handle nobody holds), served only at
 *                            /p/~<private_slug>
 *
 * The private slug is random (migration 020 explains why it must not be derived
 * from email_hash) and the owner can replace it, which is the only way to
 * withdraw a link already handed out.
 *
 * accepts_anonymous_mail is the messaging opt-in (014). Messaging is retired,
 * so nothing here sets it; writes leave the stored value alone.
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
  /** 32 hex chars; the private link is /p/~<privateSlug>. Owner-only. */
  privateSlug: string;
  createdAt: Date;
}

interface ProfileRow {
  email_hash: string;
  handle: string | null;
  display_name: string | null;
  bio_public: string | null;
  visibility: string;
  accepts_anonymous_mail: boolean;
  private_slug: string;
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
    privateSlug: row.private_slug,
    createdAt: row.created_at,
  };
}

const COLUMNS =
  'email_hash, handle, display_name, bio_public, visibility, accepts_anonymous_mail, private_slug, created_at';

/** The shape every private slug has: what migration 020 and newPrivateSlug make. */
export const PRIVATE_SLUG_RE = /^[0-9a-f]{32}$/;

/** 128 random bits as 32 lowercase hex chars, matching migration 020's format. */
export function newPrivateSlug(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

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
 * Look up a PUBLIC profile by handle.
 *
 * A private profile is not returned, so /p/<handle> answers a private handle
 * with the same 404 as an unheld one: the handle namespace cannot be used to
 * learn that a private profile exists. Private profiles are reached by
 * getProfileBySlug instead.
 *
 * Handles are stored lowercase by saveProfile. Lowercasing again here means a
 * link typed with capitals still resolves rather than 404ing on a difference
 * the user cannot see.
 */
export async function getPublicProfileByHandle(handle: string): Promise<Profile | null> {
  const normalized = handle.trim().toLowerCase();
  if (!normalized) return null;

  return await withConnection(async (client) => {
    const { rows } = await client.queryObject<ProfileRow>(
      `SELECT ${COLUMNS} FROM fresh_profiles WHERE handle = $1 AND visibility = 'public'`,
      [normalized],
    );
    return rows.length ? toProfile(rows[0]) : null;
  });
}

/**
 * Look up a profile by its private link, whatever its visibility.
 *
 * Anything not shaped like a slug is refused before the query, so the lookup
 * never runs on arbitrary input.
 */
export async function getProfileBySlug(slug: string): Promise<Profile | null> {
  if (!PRIVATE_SLUG_RE.test(slug)) return null;

  return await withConnection(async (client) => {
    const { rows } = await client.queryObject<ProfileRow>(
      `SELECT ${COLUMNS} FROM fresh_profiles WHERE private_slug = $1`,
      [slug],
    );
    return rows.length ? toProfile(rows[0]) : null;
  });
}

/**
 * The directory: profiles that chose to be listed.
 *
 * Requires a handle as well as public visibility. A public profile without one
 * cannot be linked to, so listing it would render a row that goes nowhere --
 * saveProfile already refuses that combination on write, and this is the
 * matching guard on read for any row that predates it.
 *
 * Keyset pagination on (created_at, email_hash) rather than OFFSET: the tie
 * break matters because two profiles created in the same transaction share a
 * timestamp, and an unstable sort silently drops or repeats them across pages.
 * The cursor is therefore BOTH columns, and the predicate compares the same
 * tuple the ORDER BY sorts on.
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
        // Row-value comparison, so the tuple is compared left to right in one
        // step and matches the ORDER BY exactly.
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
 * Returned as a Map because callers are joining, not iterating, and an array
 * would put the ordering burden on every one of them.
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

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

// Handles form the public URL (/p/<handle>): lowercase alphanumeric plus
// internal hyphens, 1-64 chars, no leading/trailing hyphen.
export const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export const DISPLAY_NAME_MAX = 120;
export const BIO_MAX = 2000;

// Routes and asset prefixes a handle must not shadow.
export const RESERVED_HANDLES = new Set([
  'about',
  'contact',
  'privacy',
  'api',
  'auth',
  'admin',
  'p',
  'people',
  'profile',
  'profiles',
  'login',
  'logout',
  'messages',
  'messenger',
  'questionnaire',
  'completion',
  'gate',
  'index',
  'check-email',
  'profile-choice',
  'profile-create',
  'static',
  'css',
  'js',
  'images',
  'assets',
  'fonts',
  'favicon',
  'uploads',
]);

export interface ProfileInput {
  handle: string | null;
  displayName: string | null;
  bio: string | null;
  visibility: 'private' | 'public';
}

/** Why a save was refused. Each maps to one sentence the person can act on. */
export type ProfileError =
  | 'handle_required'
  | 'handle_invalid'
  | 'handle_taken'
  | 'too_long'
  | 'failed';

export const PROFILE_ERROR_TEXT: Record<ProfileError, string> = {
  handle_required: 'A public profile needs a handle.',
  handle_invalid:
    'That handle is not available. Use up to 64 lowercase letters, digits or hyphens, not starting or ending with a hyphen.',
  handle_taken: 'That handle is already taken.',
  too_long: `Keep the display name under ${DISPLAY_NAME_MAX} characters and the statement under ${BIO_MAX}.`,
  failed: 'Could not save your profile. Please try again.',
};

/** Trim, and turn an empty string into null. */
function blankToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed.length ? trimmed : null;
}

/**
 * Normalise and check an input. Returns the cleaned input or why it is refused.
 *
 * ONLY A PUBLIC PROFILE HOLDS A HANDLE. A private one is saved with handle
 * null, whatever was typed. Handles share one UNIQUE namespace, so a private
 * profile holding one would answer "That handle is already taken" to anyone
 * who tried to claim it -- telling them a private profile exists under that
 * name, which the 404 at /p/<handle> is there to hide. With private profiles
 * out of the namespace, "taken" only ever reveals a handle that is already
 * public.
 */
export function validateProfile(raw: ProfileInput): ProfileInput | ProfileError {
  const displayName = blankToNull(raw.displayName);
  const bio = blankToNull(raw.bio);
  if ((displayName?.length ?? 0) > DISPLAY_NAME_MAX || (bio?.length ?? 0) > BIO_MAX) return 'too_long';

  if (raw.visibility !== 'public') {
    return { handle: null, displayName, bio, visibility: 'private' };
  }

  const handle = blankToNull(raw.handle)?.toLowerCase() ?? null;
  if (!handle) return 'handle_required';
  if (!HANDLE_RE.test(handle) || RESERVED_HANDLES.has(handle)) return 'handle_invalid';

  return { handle, displayName, bio, visibility: 'public' };
}

/** Postgres unique-violation error code. */
function isUniqueViolation(error: unknown): boolean {
  const code = (error as { fields?: { code?: string }; code?: string })?.fields?.code ??
    (error as { code?: string })?.code;
  return code === '23505';
}

/**
 * Create or replace the caller's profile.
 *
 * Every field in `input` is written: callers pass the whole profile, which the
 * edit form does by prefilling from the stored row. accepts_anonymous_mail and
 * private_slug are never touched by an update.
 */
export async function saveProfile(emailHash: string, raw: ProfileInput): Promise<ProfileError | null> {
  const input = validateProfile(raw);
  if (typeof input === 'string') return input;

  try {
    await withConnection(async (client) => {
      await client.queryObject(
        `INSERT INTO fresh_profiles
           (email_hash, handle, display_name, bio_public, visibility, private_slug, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (email_hash) DO UPDATE SET
           handle = EXCLUDED.handle,
           display_name = EXCLUDED.display_name,
           bio_public = EXCLUDED.bio_public,
           visibility = EXCLUDED.visibility,
           updated_at = NOW()`,
        [emailHash, input.handle, input.displayName, input.bio, input.visibility, newPrivateSlug()],
      );
    });
  } catch (error) {
    if (isUniqueViolation(error)) return 'handle_taken';
    return 'failed';
  }
  return null;
}

/** Replace the private slug, so every link handed out so far stops working. */
export async function rotatePrivateSlug(emailHash: string): Promise<boolean> {
  return await withConnection(async (client) => {
    const result = await client.queryObject(
      `UPDATE fresh_profiles SET private_slug = $2, updated_at = NOW() WHERE email_hash = $1`,
      [emailHash, newPrivateSlug()],
    );
    return (result.rowCount ?? 0) > 0;
  });
}

/** Delete the caller's profile outright. Returns whether one existed. */
export async function deleteProfile(emailHash: string): Promise<boolean> {
  return await withConnection(async (client) => {
    const result = await client.queryObject(
      `DELETE FROM fresh_profiles WHERE email_hash = $1`,
      [emailHash],
    );
    return (result.rowCount ?? 0) > 0;
  });
}
