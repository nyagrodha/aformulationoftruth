/**
 * Profile API, for scripted clients.
 *
 * POST /api/profile   JSON body, one of:
 *   { action?: 'save', visibility, handle?, displayName?, bio? }
 *   { action: 'delete' }
 *   { action: 'new-link' }
 *
 * The site's own form posts to /profile-create, which works without
 * JavaScript; both go through the writes in lib/profiles.ts.
 *
 * A save with fields omitted keeps their stored values, so a client can change
 * one thing without resending the rest. An empty string clears a field.
 *
 * gupta-vidya compliance:
 * - The owner is the authenticated session's email_hash, NEVER the request
 *   body. The caller must be same-origin and must have proved the address by
 *   opening the emailed link (requireProvenCaller), or anyone could type an
 *   address at the gate and overwrite its owner's profile.
 * - Only content the caller chooses to publish is stored, in plaintext because
 *   it is public by definition. The encrypted answer store is not touched.
 * - No profile content (handle, name, bio) is ever logged.
 */

import { Handlers } from '$fresh/server.ts';
import { z } from 'zod';
import { isRefusal, json, requireProvenCaller } from '../../lib/api-auth.ts';
import { increment } from '../../lib/metrics.ts';
import {
  deleteProfile,
  getProfile,
  PROFILE_ERROR_TEXT,
  type ProfileError,
  rotatePrivateSlug,
  saveProfile,
} from '../../lib/profiles.ts';

const SaveSchema = z.object({
  action: z.literal('save').optional(),
  handle: z.string().optional(),
  displayName: z.string().optional(),
  bio: z.string().optional(),
  visibility: z.enum(['private', 'public']).optional(),
  // Messaging is retired; the opt-in may be sent as false and is otherwise refused.
  acceptsAnonymousMail: z.literal(false).optional(),
});

const BodySchema = z.union([
  z.object({ action: z.literal('delete') }),
  z.object({ action: z.literal('new-link') }),
  SaveSchema,
]);

const STATUS: Record<ProfileError, number> = {
  handle_required: 400,
  handle_invalid: 400,
  too_long: 400,
  handle_taken: 409,
  failed: 500,
};

export const handler: Handlers = {
  async POST(req, _ctx) {
    increment('requests.api');

    const caller = await requireProvenCaller(req, 'profile');
    if (isRefusal(caller)) return caller;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      increment('errors.4xx');
      return json({ error: 'Invalid JSON body' }, 400, caller);
    }

    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      increment('errors.4xx');
      return json({ error: 'Invalid profile data' }, 400, caller);
    }
    const data = parsed.data;

    try {
      if (data.action === 'delete') {
        const existed = await deleteProfile(caller.emailHash);
        increment(existed ? 'profile.deleted' : 'profile.delete_missing');
        return json({ message: existed ? 'Profile deleted' : 'No profile to delete' }, 200, caller);
      }

      if (data.action === 'new-link') {
        if (!(await rotatePrivateSlug(caller.emailHash))) {
          return json({ error: 'Create a profile first.' }, 404, caller);
        }
        increment('profile.link_rotated');
        const profile = await getProfile(caller.emailHash);
        return json({ message: 'New private link made', privatePath: `/p/~${profile?.privateSlug}` }, 200, caller);
      }

      // Save: omitted fields keep their stored values.
      const current = await getProfile(caller.emailHash);
      const error = await saveProfile(caller.emailHash, {
        handle: data.handle ?? current?.handle ?? null,
        displayName: data.displayName ?? current?.displayName ?? null,
        bio: data.bio ?? current?.bio ?? null,
        visibility: data.visibility ?? current?.visibility ?? 'private',
      });
      if (error) {
        increment(error === 'failed' ? 'errors.5xx' : 'errors.4xx');
        if (error === 'handle_taken') increment('profile.handle_taken');
        if (error === 'failed') console.error('[profile] Failed to save profile');
        return json({ error: PROFILE_ERROR_TEXT[error] }, STATUS[error], caller);
      }

      increment('profile.saved');
      const saved = await getProfile(caller.emailHash);
      return json(
        {
          message: 'Profile saved',
          visibility: saved?.visibility,
          handle: saved?.handle,
          privatePath: saved ? `/p/~${saved.privateSlug}` : undefined,
        },
        200,
        caller,
      );
    } catch {
      console.error('[profile] Profile request failed');
      increment('errors.5xx');
      return json({ error: PROFILE_ERROR_TEXT.failed }, 500, caller);
    }
  },
};
