/**
 * Combined Gate Submit + Magic Link Endpoint
 *
 * POST /api/gate-submit
 * - Accepts email and gate answers in a single request
 * - Generates gateToken server-side
 * - Stores gate answers
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
import { createQuestionnaireSession, findActiveSession } from '../../lib/questionnaire-session.ts';
import { createQuestionnaireJWT } from '../../lib/jwt.ts';
import { increment } from '../../lib/metrics.ts';
import { sendMagicLinkEmail } from '../../lib/email.ts';
import { GATE_QUESTIONS, storeEncryptedAnswer } from '../../lib/gate_encrypt.ts';

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
          { status, headers: { 'Content-Type': 'application/json' } }
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
      // Step 1: Generate server-side gate token
      const gateToken = crypto.randomUUID();

      // Step 2: Age-encrypt each answer via the Rust gate, which holds the only
      // write path for answer text. The plaintext columns q0_answer/q1_answer
      // are deliberately left NULL — nothing reads them, and storing plaintext
      // would break the promise the gate form makes to the visitor.
      //
      // This fails closed: if the gate is down, storeEncryptedAnswer throws and
      // we abort the submission rather than persist anything in the clear.
      const q0 = answer1.trim();
      const q1 = answer2.trim();

      try {
        await storeEncryptedAnswer({
          sessionId: gateToken,
          questionIndex: 0,
          questionText: GATE_QUESTIONS[0],
          answer: q0,
          skipped: q0.length === 0,
        });
        await storeEncryptedAnswer({
          sessionId: gateToken,
          questionIndex: 1,
          questionText: GATE_QUESTIONS[1],
          answer: q1,
          skipped: q1.length === 0,
        });
      } catch {
        // Category only — the thrown error is never logged, it could carry text.
        console.error('[gate-submit] Gate encryption unavailable; submission refused');
        increment('errors.5xx');
        return fail(503, 'Unable to securely store your answers right now. Please try again.', 'server');
      }

      // The Postgres row exists only for linkage (gate_token -> session). It
      // carries no answer text.
      await withConnection(async (client) => {
        await client.queryObject(
          `INSERT INTO fresh_gate_responses (gate_token, q0_answer, q1_answer)
           VALUES ($1, NULL, NULL)`,
          [gateToken]
        );
      });

      console.log('[gate-submit] Gate answers encrypted and stored');

      // Step 3: Create magic link
      const { token: magicToken, expiresAt } = await createMagicLink(email);

      // Step 4: Hash email immediately
      const emailHash = await hashEmail(email);

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

      // Step 5: Create or resume questionnaire session with gateToken
      let sessionResult;
      const existingSession = await findActiveSession(emailHash);

      if (existingSession) {
        console.log('[gate-submit] User resuming questionnaire');
        sessionResult = await createQuestionnaireSession(emailHash, gateToken);
      } else {
        sessionResult = await createQuestionnaireSession(emailHash, gateToken);
      }

      const { opaqueToken, sessionId } = sessionResult;

      // Step 6: Create JWT
      const jwt = await createQuestionnaireJWT(emailHash, sessionId);

      // Step 7: Build magic link URL
      const baseUrl = Deno.env.get('BASE_URL') || 'http://localhost:8000';
      const magicLinkUrl = `${baseUrl}/auth/verify?token=${jwt}&resume=${opaqueToken}`;

      // Step 8: Send magic link email
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
        { status: 200, headers: { 'Content-Type': 'application/json' } }
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
