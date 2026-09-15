/**
 * Send one sealed message to a profile, addressed by handle.
 *
 * The body carries ciphertext and an IV and nothing else that means anything --
 * this handler never sees a word of what it is delivering.
 *
 * Addressed by handle rather than by email_hash. A hash is not something anyone
 * types, and accepting one would let a caller write to an identity it worked out
 * some other way, with no profile and no opt-in in the path at all. The handle
 * is the published name; resolving it here is what makes consent checkable.
 */

import { Handlers } from '$fresh/server.ts';
import { z } from 'zod';
import { increment } from '../../../lib/metrics.ts';
import { isRefusal, json, requireProvenCaller } from '../../../lib/api-auth.ts';
import { getProfileByHandle } from '../../../lib/profiles.ts';
import {
  Blocked,
  getPublicKey,
  MAX_CIPHERTEXT_CHARS,
  NoIdentity,
  RateLimited,
  sendMessage,
} from '../../../lib/messenger.ts';

const SendSchema = z.object({
  to: z.string().trim().toLowerCase().min(1).max(64),
  ciphertext: z.string().min(1).max(MAX_CIPHERTEXT_CHARS),
  iv: z.string().min(8).max(64),
});

export const handler: Handlers = {
  async POST(req, _ctx) {
    increment('requests.api');

    const caller = await requireProvenCaller(req);
    if (isRefusal(caller)) return caller;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      increment('errors.4xx');
      return json({ error: 'Invalid request body.' }, 400, caller);
    }

    const parsed = SendSchema.safeParse(body);
    if (!parsed.success) {
      increment('errors.4xx');
      return json({ error: 'That message could not be sent as written.' }, 400, caller);
    }

    const recipient = await getProfileByHandle(parsed.data.to);

    /*
     * One response for "no such profile" and for "that profile is closed to
     * mail". Distinguishing them turns this endpoint into an oracle for which
     * handles exist and which of them accept messages, which is exactly the
     * enumeration the opt-in is meant to prevent.
     */
    if (!recipient || !recipient.acceptsMail) {
      increment('messenger.denied.not_accepting');
      return json({ error: 'That profile is not accepting messages.' }, 404, caller);
    }

    try {
      const { threadId } = await sendMessage({
        senderEmailHash: caller.emailHash,
        recipientEmailHash: recipient.emailHash,
        ciphertext: parsed.data.ciphertext,
        iv: parsed.data.iv,
      });
      return json({ ok: true, threadId }, 201, caller);
    } catch (error) {
      if (error instanceof NoIdentity) {
        return json(
          {
            error: 'That profile has not set up messaging yet, so nothing can be sealed to them.',
          },
          409,
          caller,
        );
      }
      if (error instanceof Blocked) {
        // Same wording as a closed profile, for the same reason.
        return json({ error: 'That profile is not accepting messages.' }, 404, caller);
      }
      if (error instanceof RateLimited) {
        increment('messenger.denied.rate_limited');
        return json(
          {
            error: 'You have sent this person several messages just now. Please give them a moment to reply.',
          },
          429,
          caller,
        );
      }
      console.error('[messenger] Send failed');
      increment('errors.5xx');
      return json({ error: 'Could not send that message. Please try again.' }, 500, caller);
    }
  },

  /**
   * The recipient's public key, so the browser can seal to them.
   *
   * Gated on the same opt-in as sending. Serving it freely would publish who has
   * set up messaging, and would let a caller confirm a handle exists without
   * ever posting anything.
   */
  async GET(req, _ctx) {
    increment('requests.api');

    const caller = await requireProvenCaller(req);
    if (isRefusal(caller)) return caller;

    const handle = new URL(req.url).searchParams.get('to')?.trim().toLowerCase();
    if (!handle) {
      increment('errors.4xx');
      return json({ error: 'No recipient given.' }, 400, caller);
    }

    const recipient = await getProfileByHandle(handle);
    if (!recipient || !recipient.acceptsMail) {
      return json({ error: 'That profile is not accepting messages.' }, 404, caller);
    }

    const publicKey = await getPublicKey(recipient.emailHash);
    if (!publicKey) {
      return json(
        {
          error: 'That profile has not set up messaging yet, so nothing can be sealed to them.',
        },
        409,
        caller,
      );
    }

    return json({ publicKey, handle: recipient.handle }, 200, caller);
  },
};
