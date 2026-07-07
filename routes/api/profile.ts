/**
 * Profile Save Endpoint
 *
 * POST /api/profile
 *
 * Creates or updates the caller's optional profile (handle / display name /
 * bio / visibility). Per-answer publishing is a separate follow-up.
 *
 * gupta-vidya compliance:
 * - The owner is the authenticated session's email_hash, derived from the
 *   jwt cookie -> session, NEVER from the request body.
 * - Only content the caller chooses to publish is stored, and in plaintext
 *   because it is public by definition. The encrypted answer store is not
 *   touched.
 * - No profile content (handle, name, bio) is ever logged.
 */

import { Handlers } from '$fresh/server.ts';
import { z } from 'zod';
import { withConnection } from '../../lib/db.ts';
import { verifyQuestionnaireJWT } from '../../lib/jwt.ts';
import { getSessionById } from '../../lib/questionnaire-session.ts';
import { increment } from '../../lib/metrics.ts';

// Handles form the public URL (/p/<handle>): lowercase alphanumeric plus
// internal hyphens, 2-64 chars, no leading/trailing hyphen.
const HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

// Routes and asset prefixes a handle must not shadow.
const RESERVED_HANDLES = new Set([
  'about', 'contact', 'privacy', 'api', 'auth', 'admin', 'p', 'profile',
  'profiles', 'login', 'logout', 'questionnaire', 'completion', 'gate',
  'index', 'check-email', 'profile-choice', 'profile-create', 'static',
  'css', 'js', 'images', 'assets', 'fonts', 'favicon', 'uploads',
]);

const ProfileSchema = z.object({
  handle: z.string().trim().toLowerCase().optional(),
  displayName: z.string().trim().max(120).optional(),
  bio: z.string().trim().max(2000).optional(),
  visibility: z.enum(['private', 'public']),
  acceptsAnonymousMail: z.boolean().optional().default(false),
});

function getCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Postgres unique-violation error code. */
function isUniqueViolation(error: unknown): boolean {
  const code = (error as { fields?: { code?: string }; code?: string })?.fields?.code ??
    (error as { code?: string })?.code;
  return code === '23505';
}

export const handler: Handlers = {
  async POST(req, _ctx) {
    increment('requests.api');

    // Step 1: Authenticate via the same session gate the profile pages use.
    const jwtToken = getCookie(req.headers.get('Cookie'), 'jwt');
    if (!jwtToken) return json({ error: 'Not authenticated' }, 401);

    const jwtPayload = await verifyQuestionnaireJWT(jwtToken);
    if (!jwtPayload) return json({ error: 'Not authenticated' }, 401);

    const session = await getSessionById(jwtPayload.session_id);
    if (!session) return json({ error: 'Session not found' }, 401);

    const emailHash = session.emailHash;

    // Step 2: Parse and validate the submitted profile.
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      increment('errors.4xx');
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const parsed = ProfileSchema.safeParse(body);
    if (!parsed.success) {
      increment('errors.4xx');
      return json({ error: 'Invalid profile data' }, 400);
    }

    const { visibility, acceptsAnonymousMail } = parsed.data;
    const handle = parsed.data.handle && parsed.data.handle.length ? parsed.data.handle : null;
    const displayName = parsed.data.displayName && parsed.data.displayName.length ? parsed.data.displayName : null;
    const bio = parsed.data.bio && parsed.data.bio.length ? parsed.data.bio : null;

    // Public profiles are addressed by handle, so it is required and must
    // be well-formed and not shadow a real route.
    if (visibility === 'public') {
      if (!handle) {
        increment('errors.4xx');
        return json({ error: 'A public profile needs a handle.' }, 400);
      }
    }
    if (handle && (!HANDLE_RE.test(handle) || RESERVED_HANDLES.has(handle))) {
      increment('errors.4xx');
      return json({ error: 'That handle is not available.' }, 400);
    }

    // Step 3: Upsert the profile for this identity.
    try {
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
          [emailHash, handle, displayName, bio, visibility, acceptsAnonymousMail],
        );
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        increment('profile.handle_taken');
        return json({ error: 'That handle is already taken.' }, 409);
      }
      console.error('[profile] Failed to save profile');
      increment('errors.5xx');
      return json({ error: 'Could not save your profile. Please try again.' }, 500);
    }

    increment('profile.saved');
    return json({ message: 'Profile saved', visibility, handle }, 200);
  },
};
