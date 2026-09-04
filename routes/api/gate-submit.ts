/**
 * Combined Gate Submit + Magic Link Endpoint
 *
 * POST /api/gate-submit
 * - Accepts email and gate answers in a single request
 * - Creates or resumes the questionnaire session; the gate (token, keypair,
 *   row, Q0-Q1 ciphertext) is provisioned LAZILY inside that transaction,
 *   and only when no linked gate row already exists -- a resume mints nothing
 * - Creates and sends magic link
 *
 * gupta-vidya compliance:
 * - Email used for delivery only, immediately hashed
 * - Gate token is random, unlinkable
 * - All processing happens server-side
 */

import { Handlers } from '$fresh/server.ts';
import { z } from 'zod';
import { withConnection } from '../../lib/db.ts';
import { createMagicLink } from '../../lib/auth.ts';
import { hashEmail } from '../../lib/crypto.ts';
import { createQuestionnaireSession, type SessionCreationResult } from '../../lib/questionnaire-session.ts';
import { createQuestionnaireJWT } from '../../lib/jwt.ts';
import { increment } from '../../lib/metrics.ts';
import { sendMagicLinkEmail } from '../../lib/email.ts';
import { buildFreshGateProvisioner, freshGateState } from '../../lib/gate-provision.ts';
import { shredRemoteIdentity } from '../../lib/session-keys.ts';

const GateSubmitSchema = z.object({
  email: z.string().email(),
  answer1: z.string().max(20000).optional().default(''),
  answer2: z.string().max(20000).optional().default(''),
});

/**
 * Read the submission body from either a native HTML form
 * (application/x-www-form-urlencoded / multipart) or a JSON fetch.
 * The landing-page gate form posts urlencoded with no JS; SPA/island
 * clients post JSON. Returns null if the body can't be parsed.
 */
async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  const contentType = req.headers.get('content-type') || '';
  try {
    if (contentType.includes('application/json')) {
      return await req.json();
    }
    // form-urlencoded or multipart/form-data
    const form = await req.formData();
    const obj: Record<string, unknown> = {};
    for (const [key, value] of form.entries()) {
      if (typeof value === 'string') obj[key] = value;
    }
    return obj;
  } catch {
    return null;
  }
}

/**
 * The link a respondent receives.
 *
 * Both halves are load-bearing and neither is optional: `token` is the JWT the
 * verifier checks, `resume` is the opaque token whose HMAC IS the session id.
 * Exported so a test can assert the shape without a mail server, and so the
 * end-to-end walk can follow the real link rather than a reconstruction of it.
 */
export function buildMagicLinkUrl(
  baseUrl: string,
  jwt: string,
  opaqueToken: string,
): string {
  return `${baseUrl}/auth/verify?token=${jwt}&resume=${opaqueToken}`;
}

/**
 * Test seam: the last magic link this process built.
 *
 * Deliberately not a general hook -- it holds a URL that is already leaving via
 * email, and nothing reads it in production. It exists so the end-to-end test
 * can complete the flow without a mailbox.
 */
export const magicLinkForTesting: { last: string | null } = { last: null };

export const handler: Handlers = {
  async POST(req, _ctx) {
    increment('requests.api');

    // Native form posts want an HTML redirect; JSON clients want JSON.
    const wantsJson = (req.headers.get('content-type') || '').includes('application/json') ||
      (req.headers.get('accept') || '').includes('application/json');

    const fail = (status: number, error: string, redirectError: string) => {
      if (wantsJson) {
        return new Response(
          JSON.stringify({ error }),
          { status, headers: { 'Content-Type': 'application/json' } },
        );
      }
      // No-JS form path: bounce back to the gate with an error flag (no PII in URL).
      return new Response(null, {
        status: 303,
        headers: { Location: `/?error=${redirectError}#begin` },
      });
    };

    const body = await readBody(req);
    if (body === null) {
      increment('errors.4xx');
      return fail(400, 'Invalid request body', 'invalid');
    }

    const parsed = GateSubmitSchema.safeParse(body);
    if (!parsed.success) {
      increment('errors.4xx');
      return fail(400, 'Valid email required', 'email');
    }

    const { email, answer1, answer2 } = parsed.data;

    try {
      const q0 = answer1.trim();
      const q1 = answer2.trim();

      // Step 1: Hash email immediately.
      const emailHash = await hashEmail(email);

      // Step 2: Create or resume the questionnaire session, provisioning the
      // gate LAZILY inside it.
      //
      // Nothing gate-shaped exists yet -- no token, no keypair, no key-box
      // push, no row, no Q0-Q1 ciphertext. createQuestionnaireSession invokes
      // the provisioner inside its transaction, under the per-email advisory
      // lock, and ONLY if no linked gate row already carries this
      // respondent's walk. This route used to provision all of it eagerly,
      // and on every resume the freshly minted set was orphaned: the unused
      // identity sat on the key box for the 30-day shred window, and the
      // unlinked row plus its Q0-Q1 ciphertext (undeletable by the runtime
      // role) sat in Postgres forever. A resume now mints nothing -- and no
      // longer needs the key box to be reachable at all.
      //
      // Still fails closed for a first-timer: a provisioning failure aborts
      // the transaction, which takes the gate row and the session with it.
      const gateState = freshGateState();
      const provisionFreshGate = buildFreshGateProvisioner({ email, q0, q1 }, gateState);

      let sessionResult: SessionCreationResult;
      try {
        sessionResult = await createQuestionnaireSession(emailHash, provisionFreshGate);
      } catch {
        // The rollback reclaimed the row; what it cannot reach is an identity
        // that may be sitting on the key box. `pushed` covers every failure
        // after a confirmed push (the gate store, the session insert, the
        // commit). A push that failed AMBIGUOUSLY -- ssh killed at its
        // deadline, which can leave a complete or truncated key
        // indistinguishably -- reports pushed=false but still named its token
        // in state, so it is withdrawn too. Only a submission that never
        // minted a token (a resume, or a pre-push failure) has nothing to
        // shred. Best-effort: we are already refusing the submission and must
        // not fail differently because cleanup failed.
        if (gateState.gateToken) {
          await shredRemoteIdentity(gateState.gateToken).catch(() => {});
        }

        // Category only — the thrown error is never logged, it could carry text.
        console.error('[gate-submit] Session provisioning failed; submission refused');
        increment('errors.5xx');
        return fail(503, 'Unable to securely store your answers right now. Please try again.', 'server');
      }

      console.log(
        sessionResult.resuming
          ? '[gate-submit] Resuming questionnaire; prior answers carried forward'
          : '[gate-submit] New session; gate answers encrypted and stored',
      );

      // Step 3: Create magic link
      const { expiresAt } = await createMagicLink(email);

      // Step 4b: If this entry began at a wearable's QR (/w/:token planted
      // the cookie), record the encounter -- pseudonymous, hash only.
      // Silent rate cap per token (no oracle for abusers); failures never
      // block the gate flow.
      try {
        const cookieHeader = req.headers.get('Cookie') || '';
        const wMatch = cookieHeader.match(/(?:^|;\s*)wearable_token=([A-Za-z0-9_-]{16,64})/);
        if (wMatch) {
          const wearableToken = wMatch[1];
          await withConnection(async (client) => {
            const cap = await client.queryObject<{ n: bigint }>(
              `SELECT COUNT(*)::bigint AS n FROM fresh_encounters
                WHERE wearable_token = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
              [wearableToken],
            );
            if (Number(cap.rows[0]?.n ?? 0) < 20) {
              await client.queryObject(
                `INSERT INTO fresh_encounters (wearable_token, scanner_email_hash)
                 VALUES ($1, $2)`,
                [wearableToken, emailHash],
              );
            }
          });
          console.log('[gate-submit] Encounter recorded');
        }
      } catch (encounterErr) {
        console.error('[gate-submit] Encounter recording failed (non-fatal):', encounterErr);
      }

      const { opaqueToken, sessionId } = sessionResult;

      // Step 6: Create JWT
      //
      // 'link', not 'gate', even though this is the gate handler: the token
      // built here is never handed to the browser that posted the form. It goes
      // into the magic-link URL below and becomes a cookie only when
      // /auth/verify receives it back, which requires reading mail at the
      // address. See JWTVia, and resumeCookie() for the bypass that closed.
      const jwt = await createQuestionnaireJWT(emailHash, sessionId, 'link');

      // Step 7: Build magic link URL
      const baseUrl = Deno.env.get('BASE_URL') || 'http://localhost:8000';
      const magicLinkUrl = buildMagicLinkUrl(baseUrl, jwt, opaqueToken);

      // Step 8: Send magic link email. The URL is handed to the seam below
      // first, so an end-to-end test can follow exactly the link a respondent
      // would receive without anything being posted to a mail server.
      magicLinkForTesting.last = magicLinkUrl;
      const emailResult = await sendMagicLinkEmail(email, magicLinkUrl);

      if (!emailResult.success) {
        // Status only — the error may carry the recipient address (CLAUDE.md).
        console.error('[gate-submit] Email delivery failed');
        increment('errors.email');
        return fail(500, 'Failed to send magic link email. Please try again.', 'send');
      }

      increment('auth.magiclink.sent');
      increment('questionnaire.started');

      console.log('[gate-submit] Magic link sent, expires:', expiresAt.toISOString());

      // Native form path: 303-redirect to the no-JS success page.
      // JSON clients get the structured response.
      if (!wantsJson) {
        return new Response(null, {
          status: 303,
          headers: { Location: '/check-email' },
        });
      }

      return new Response(
        JSON.stringify({
          message: 'Magic link sent',
          expiresAt: expiresAt.toISOString(),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    } catch {
      // Category only. The error object can carry the submitted answers or the
      // email address, so it is never logged (CLAUDE.md: zero-logging).
      console.error('[gate-submit] Submission failed');
      increment('errors.5xx');

      return fail(500, 'Failed to process submission', 'server');
    }
  },
};
