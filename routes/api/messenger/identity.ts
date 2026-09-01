/**
 * The caller's own keystore record.
 *
 * GET  returns the wrapped identity so the browser can unlock it locally.
 * POST stores a newly minted one.
 *
 * The wrapped private key is returned to its owner and to nobody else. It is
 * AES-GCM ciphertext under a passphrase this server never receives, so it is
 * inert without the person -- but it is still theirs alone, and a route that
 * served it by handle would hand every keystore to anyone willing to guess.
 */

import { Handlers } from '$fresh/server.ts';
import { z } from 'zod';
import { increment } from '../../../lib/metrics.ts';
import { isRefusal, json, requireProvenCaller } from '../../../lib/api-auth.ts';
import { createIdentity, getIdentity } from '../../../lib/messenger.ts';

/*
 * Bounds on every field, because these arrive from a browser that may not be
 * ours. A P-256 raw public key is 65 bytes -> 88 base64 characters; the wrapped
 * pkcs8 blob is a little over 100 bytes -> comfortably under 512. The limits
 * refuse the absurd rather than pinning exact sizes, so a future curve or a
 * differently-padded export still stores.
 */
const IdentitySchema = z.object({
  publicKey: z.string().min(80).max(256),
  wrappedPrivate: z.string().min(16).max(2048),
  wrapIv: z.string().min(8).max(64),
  kdfSalt: z.string().min(8).max(128),
  kdfIterations: z.number().int().min(100000).max(1000000),
});

/* Postgres unique_violation, however the driver chose to wrap it. */
function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: unknown; fields?: { code?: unknown } })?.code ??
    (error as { fields?: { code?: unknown } })?.fields?.code;
  return code === '23505';
}

export const handler: Handlers = {
  async GET(req, _ctx) {
    increment('requests.api');

    const caller = await requireProvenCaller(req);
    if (isRefusal(caller)) return caller;

    const identity = await getIdentity(caller.emailHash);
    if (!identity) return json({ identity: null }, 200, caller);

    return json(
      {
        identity: {
          publicKey: identity.publicKey,
          wrappedPrivate: identity.wrappedPrivate,
          wrapIv: identity.wrapIv,
          kdfSalt: identity.kdfSalt,
          kdfIterations: identity.kdfIterations,
        },
      },
      200,
      caller,
    );
  },

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

    const parsed = IdentitySchema.safeParse(body);
    if (!parsed.success) {
      increment('errors.4xx');
      return json({ error: 'That identity is not in a form we can store.' }, 400, caller);
    }

    /*
     * Refuse rather than replace. Overwriting a keypair makes every message
     * already sealed to the old public half unreadable forever, with no error at
     * the moment of loss. createIdentity is INSERT-only for the same reason;
     * this check turns the resulting constraint violation into an explanation.
     */
    if (await getIdentity(caller.emailHash)) {
      increment('messenger.identity.duplicate');
      return json(
        {
          error: 'You already have a messaging identity. Replacing it would make your existing messages unreadable.',
        },
        409,
        caller,
      );
    }

    try {
      await createIdentity({ emailHash: caller.emailHash, ...parsed.data });
    } catch (error) {
      /*
       * The check above is not the last word: two tabs posting at once both
       * read "no identity" and both insert, and the loser used to be told the
       * save had failed and to try again -- advice that cannot work, because
       * the identity it would replace is now there. The primary key is what
       * actually decides, so a unique violation is the same answer as the
       * pre-check, arrived at later. 23505 is Postgres's unique_violation.
       */
      if (isUniqueViolation(error)) {
        increment('messenger.identity.duplicate');
        return json(
          {
            error: 'You already have a messaging identity. Replacing it would make your existing messages unreadable.',
          },
          409,
          caller,
        );
      }
      console.error('[messenger] Identity creation failed');
      increment('errors.5xx');
      return json({ error: 'Could not save your identity. Please try again.' }, 500, caller);
    }

    return json({ ok: true }, 201, caller);
  },
};
