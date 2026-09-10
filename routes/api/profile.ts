/**
 * Profile Save Endpoint
 *
 * POST /api/profile
 *
 * Creates or updates the caller's optional profile. Per-answer publishing is
 * a separate follow-up and is not stored here.
 *
 * gupta-vidya compliance:
 * - The owner is the authenticated session's email_hash, NEVER from the body.
 * - Only chosen public fields are stored, in plaintext because they are public.
 * - No profile content is logged.
 */

import { Handlers } from '$fresh/server.ts';
import { increment } from '../../lib/metrics.ts';
import { identityFromRequest } from '../../lib/profile-session.ts';
import { emptyToNull, ProfileFieldsSchema, saveProfile } from '../../lib/profiles.ts';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const handler: Handlers = {
  async POST(req, _ctx) {
    increment('requests.api');

    const identity = await identityFromRequest(req);
    if (!identity) return json({ error: 'Not authenticated' }, 401);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      increment('errors.4xx');
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const parsed = ProfileFieldsSchema.safeParse(body);
    if (!parsed.success) {
      increment('errors.4xx');
      return json({ error: 'Invalid profile data' }, 400);
    }

    const { visibility, acceptsAnonymousMail } = parsed.data;
    const result = await saveProfile(identity.emailHash, {
      handle: emptyToNull(parsed.data.handle),
      displayName: emptyToNull(parsed.data.displayName),
      bio: emptyToNull(parsed.data.bio),
      visibility,
      acceptsAnonymousMail,
    });

    if (!result.ok) {
      if (result.status === 409) increment('profile.handle_taken');
      else if (result.status >= 500) increment('errors.5xx');
      else increment('errors.4xx');
      return json({ error: result.error }, result.status);
    }

    increment('profile.saved');
    return json({ message: 'Profile saved', visibility: result.visibility, handle: result.handle }, 200);
  },
};
