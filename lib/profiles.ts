/**
 * Optional profiles: write, read, and the handle rules they share.
 *
 * A profile is keyed to email_hash (never an email). Only content the owner
 * chooses to publish lives here, so handle / display_name / bio_public are
 * plaintext by design. The encrypted answer store is not touched.
 *
 *   visibility='public'      -> listed in /people
 *   accepts_anonymous_mail   -> may be sent a message
 *
 * They are independent. A listed profile can refuse mail. An unlisted one can
 * still be reached at /p/<handle> by anyone who was given the address — the
 * directory decision and the addressability decision are separate. Callers
 * that must not expose an unlisted profile check `visibility` themselves.
 *
 * Zero-logging: a handle is chosen for publication, but an email_hash is not,
 * and the two travel together here.
 */

import { z } from 'zod';
import { withConnection } from './db.ts';

export const PROFILE_DISPLAY_NAME_MAX = 120;
export const PROFILE_BIO_MAX = 2000;

export const ProfileFieldsSchema = z.object({
  handle: z.string().trim().toLowerCase().optional(),
  displayName: z.string().trim().max(PROFILE_DISPLAY_NAME_MAX, 'That display name is too long.').optional(),
  bio: z.string().trim().max(PROFILE_BIO_MAX, 'That statement is too long.').optional(),
  visibility: z.enum(['private', 'public']),
  acceptsAnonymousMail: z.boolean().optional().default(false),
});

/** Lowercase letters, digits, internal hyphens. Two to 64 characters. */
export const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])$/;

export const RESERVED_HANDLES = new Set([
  'about',
  'contact',
  'privacy',
  'api',
  'auth',
  'admin',
  'p',
  'profile',
  'profiles',
  'people',
  'login',
  'logout',
  'questionnaire',
  'completion',
  'gate',
  'index',
  'check-email',
  'profile-choice',
  'profile-create',
  'messenger',
  'encrypted-messenger',
  'messages',
  'lotto',
  'shop',
  'static',
  'css',
  'js',
  'images',
  'assets',
  'fonts',
  'favicon',
  'uploads',
  'w',
  '4m',
  'questions',
]);

export interface Profile {
  emailHash: string;
  handle: string | null;
  displayName: string | null;
  bio: string | null;
  visibility: 'private' | 'public';
  acceptsMail: boolean;
  createdAt: Date;
}

export interface ProfileDraft {
  handle: string | null;
  displayName: string | null;
  bio: string | null;
  visibility: 'private' | 'public';
  acceptsAnonymousMail: boolean;
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

/**
 * Why a draft must not be stored, or null if it may.
 *
 * Public profiles are addressed at /p/<handle>, so a missing handle is
 * unroutable and a reserved one would shadow a real page. Private profiles
 * may omit a handle entirely.
 */
export function profileHandleError(
  handle: string | null,
  visibility: 'private' | 'public',
): string | null {
  if (visibility === 'public' && !handle) {
    return 'A public profile needs a handle.';
  }
  if (handle && (!HANDLE_RE.test(handle) || RESERVED_HANDLES.has(handle))) {
    return 'That handle is not available.';
  }
  return null;
}

/**
 * Map the create-form radios onto the stored schema.
 *
 * "selected" is listed (public) with no per-answer publish yet.
 * "anonymous-mail" stays unlisted and opts in to mail.
 */
export function formVisibilityToSchema(
  choice: string,
): { visibility: 'private' | 'public'; acceptsAnonymousMail: boolean } {
  if (choice === 'selected') return { visibility: 'public', acceptsAnonymousMail: false };
  if (choice === 'anonymous-mail') return { visibility: 'private', acceptsAnonymousMail: true };
  return { visibility: 'private', acceptsAnonymousMail: false };
}

export function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length ? trimmed : null;
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
 * Look up a profile by handle.
 *
 * Reachable whether or not the profile is listed: the directory decision and
 * the addressability decision are separate, and a handle someone hands out
 * should resolve for whoever was handed it. Callers that must not expose an
 * unlisted profile check `visibility` themselves.
 *
 * Handles are stored lowercase by the write path. Lowercasing again here means
 * a link typed with capitals still resolves rather than 404ing on a difference
 * the user cannot see.
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

/** After a save: listed profiles go to /p/<handle>, private ones to completion. */
export function profileAfterSavePath(
  visibility: 'private' | 'public',
  handle: string | null | undefined,
): string {
  if (visibility === 'public' && handle) return `/p/${encodeURIComponent(handle)}`;
  return '/completion';
}

export type SaveProfileResult =
  | { ok: true; handle: string | null; visibility: 'private' | 'public' }
  | { ok: false; status: 400 | 409 | 500; error: string };

/** Postgres unique-violation error code. */
function isUniqueViolation(error: unknown): boolean {
  const code = (error as { fields?: { code?: string }; code?: string })?.fields?.code ??
    (error as { code?: string })?.code;
  return code === '23505';
}

/**
 * Validate and write a profile for the given identity.
 * Callers never pass email_hash in from the body — only from the session.
 */
export async function saveProfile(
  emailHash: string,
  draft: ProfileDraft,
): Promise<SaveProfileResult> {
  const handleError = profileHandleError(draft.handle, draft.visibility);
  if (handleError) {
    return { ok: false, status: 400, error: handleError };
  }
  if ((draft.displayName?.length ?? 0) > PROFILE_DISPLAY_NAME_MAX) {
    return { ok: false, status: 400, error: 'That display name is too long.' };
  }
  if ((draft.bio?.length ?? 0) > PROFILE_BIO_MAX) {
    return { ok: false, status: 400, error: 'That statement is too long.' };
  }

  try {
    await upsertProfile(emailHash, draft);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, status: 409, error: 'That handle is already taken.' };
    }
    console.error('[profile] Failed to save profile');
    return { ok: false, status: 500, error: 'Could not save your profile. Please try again.' };
  }

  return { ok: true, handle: draft.handle, visibility: draft.visibility };
}

export async function upsertProfile(emailHash: string, draft: ProfileDraft): Promise<void> {
  await withConnection(async (client) => {
    await client.queryObject(
      `INSERT INTO fresh_profiles
         (email_hash, handle, display_name, bio_public, visibility, accepts_anonymous_mail, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (email_hash) DO UPDATE SET
         handle = EXCLUDED.handle,
         display_name = EXCLUDED.display_name,
         bio_public = EXCLUDED.bio_public,
         visibility = EXCLUDED.visibility,
         accepts_anonymous_mail = EXCLUDED.accepts_anonymous_mail,
         updated_at = NOW()`,
      [
        emailHash,
        draft.handle,
        draft.displayName,
        draft.bio,
        draft.visibility,
        draft.acceptsAnonymousMail,
      ],
    );
  });
}

/**
 * The directory: profiles that chose to be listed.
 *
 * Requires a handle as well as public visibility. Keyset pagination on
 * (created_at, email_hash) rather than OFFSET, so two profiles created in
 * the same transaction are not dropped or repeated across pages.
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
 * publish a value the rest of the schema works to keep unpublished.
 */
export function profileLabel(profile: Profile | null | undefined): string {
  if (!profile) return 'someone';
  return profile.displayName?.trim() || profile.handle?.trim() || 'someone';
}
