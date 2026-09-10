/**
 * Optional profiles: write, read, and the handle rules they share.
 *
 * A profile is keyed to email_hash (never an email). Only content the owner
 * chooses to publish lives here, so handle / display_name / bio_public are
 * plaintext by design. The encrypted answer store is not touched.
 *
 *   visibility='public'      -> may be listed in the directory
 *   accepts_anonymous_mail   -> may be sent a message
 *
 * They are independent. A listed profile can refuse mail; an unlisted one can
 * still be reached at /p/<handle> by anyone who was given the address.
 */

import { withConnection } from './db.ts';

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

export async function listPublicProfiles(opts: { limit?: number } = {}): Promise<Profile[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);

  return await withConnection(async (client) => {
    const { rows } = await client.queryObject<ProfileRow>(
      `SELECT ${COLUMNS} FROM fresh_profiles
        WHERE visibility = 'public' AND handle IS NOT NULL
        ORDER BY created_at DESC, email_hash DESC
        LIMIT $1`,
      [limit],
    );
    return rows.map(toProfile);
  });
}

export function profileLabel(profile: Profile | null | undefined): string {
  if (!profile) return 'someone';
  return profile.displayName?.trim() || profile.handle?.trim() || 'someone';
}
