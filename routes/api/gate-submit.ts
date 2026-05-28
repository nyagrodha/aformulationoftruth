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
import { validateEmail } from '../../lib/emailValidator.ts';
import { withConnection } from '../../lib/db.ts';
import { createMagicLink } from '../../lib/auth.ts';
import { hashEmail } from '../../lib/crypto.ts';
import {
  completeSupersededSessions,
  createQuestionnaireSession,
  deleteSession,
  findActiveSession,
  resumeSession,
} from '../../lib/questionnaire-session.ts';

/**
 * Detect whether the caller wants HTML (form POST/Redirect/GET — zero-JS)
 * or JSON (legacy/AJAX). We treat anything that explicitly accepts text/html
 * or sends form-urlencoded as the HTML path; everything else as JSON.
 */
function wantsHtml(req: Request): boolean {
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
    return true;
  }
  const accept = req.headers.get('accept') || '';
  return accept.includes('text/html') && !accept.includes('application/json');
}

function htmlRedirect(path: string): Response {
  return new Response(null, { status: 303, headers: { Location: path } });
}

function jsonError(status: number, message: string): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}
import { createQuestionnaireJWT } from '../../lib/jwt.ts';
import { increment } from '../../lib/metrics.ts';
import { sendMagicLinkEmail } from '../../lib/email.ts';
import { storeEncryptedAnswer } from '../../lib/gate-client.ts';
import { ageEncrypt } from '../../lib/age-encrypt.ts';

const GateSubmitSchema = z.object({
  email: z.string().min(1),
  answer1: z.string().max(20000).optional().default(''),
  answer2: z.string().max(20000).optional().default(''),
});

export const handler: Handlers = {
  async POST(req, _ctx) {
    increment('requests.api');

    const html = wantsHtml(req);

    // Parse JSON or form-encoded body. Either way we end up with the same
    // {email, answer1, answer2} object the rest of this handler expects.
    let body: Record<string, unknown> = {};
    try {
      if (html) {
        const form = await req.formData();
        body = {
          email: (form.get('email') ?? '').toString(),
          answer1: (form.get('answer1') ?? '').toString(),
          answer2: (form.get('answer2') ?? '').toString(),
        };
      } else {
        body = await req.json();
      }
    } catch {
      increment('errors.4xx');
      return html
        ? htmlRedirect('/?error=bad_body')
        : jsonError(400, 'Invalid body');
    }

    const parsed = GateSubmitSchema.safeParse(body);
    if (!parsed.success) {
      increment('errors.4xx');
      return html
        ? htmlRedirect('/?error=missing_email')
        : jsonError(400, 'Email required');
    }

    // Validate and normalize email
    const emailValidation = validateEmail(parsed.data.email);
    if (!emailValidation.valid) {
      increment('errors.4xx');
      if (emailValidation.reason === 'suspicious_pattern') {
        increment('errors.suspicious_email');
        console.log('[gate-submit] Blocked suspicious email pattern');
      }
      return html
        ? htmlRedirect('/?error=bad_email')
        : jsonError(400, 'Please use a valid email address');
    }

    const email = emailValidation.normalized;
    const { answer1, answer2 } = parsed.data;

    // Require at least one non-empty answer
    if (!answer1.trim() && !answer2.trim()) {
      increment('errors.4xx');
      return html
        ? htmlRedirect('/?error=no_answer')
        : jsonError(400, 'Please answer at least one question');
    }

    try {
      // Step 1: Generate server-side gate token
      const gateToken = crypto.randomUUID();

      // Step 2: Encrypt gate answers via Rust Gate (age x25519)
      const GATE_QUESTIONS = [
        'What is your idea of perfect happiness?',
        'What is your greatest fear?',
      ];

      const q0 = answer1.trim();
      const q1 = answer2.trim();

      if (q0) {
        await storeEncryptedAnswer({
          sessionId: gateToken,
          questionText: GATE_QUESTIONS[0],
          questionIndex: 0,
          answer: q0,
          skipped: false,
        });
      }

      if (q1) {
        await storeEncryptedAnswer({
          sessionId: gateToken,
          questionText: GATE_QUESTIONS[1],
          questionIndex: 1,
          answer: q1,
          skipped: false,
        });
      }

      // Age-encrypt email for offline PDF delivery (only private key holder can recover)
      const encryptedEmail = await ageEncrypt(email);

      // Insert linking row with encrypted email (no plaintext stored)
      await withConnection(async (client) => {
        await client.queryObject(
          `INSERT INTO fresh_gate_responses (gate_token, encrypted_email)
           VALUES ($1, $2)
           ON CONFLICT (gate_token) DO UPDATE SET encrypted_email = $2`,
          [gateToken, encryptedEmail]
        );
      });

      console.log('[gate-submit] Gate answers encrypted and stored, token:', gateToken.slice(0, 8) + '...');

      // Step 3: Create magic link
      const { expiresAt, cleanup: cleanupMagicLink } = await createMagicLink(email);

      // Step 4: Hash email immediately
      const emailHash = await hashEmail(email);

      // Step 5: Create or resume questionnaire session with gateToken.
      // For returning users we MUST preserve progress — rotate the opaque
      // token (and therefore the derived session_id) but copy
      // question_order / answered_questions / current_index forward.
      const existingSession = await findActiveSession(emailHash);
      const sessionResult = existingSession
        ? await resumeSession(existingSession, gateToken)
        : await createQuestionnaireSession(emailHash, gateToken);
      if (existingSession) {
        console.log(
          '[gate-submit] Returning user — resumed session at index',
          existingSession.currentIndex,
          'of',
          existingSession.answeredQuestions.length,
          'answered',
        );
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
        console.error('[gate-submit] Email failed:', emailResult.error);
        increment('errors.email');

        // Clean up orphaned records on email failure
        // 1. Clean up magic link
        await cleanupMagicLink();

        // 2. Delete the questionnaire session (this also unlinks gate responses).
        //    On the resume path the OLD session row is NOT touched by
        //    resumeSession(), so deleting the new row here fully reverts.
        await deleteSession(sessionId);

        // 3. Delete the gate responses that were just inserted
        try {
          await withConnection(async (client) => {
            await client.queryObject(
              `DELETE FROM fresh_gate_responses WHERE gate_token = $1`,
              [gateToken]
            );
          });
          console.log('[gate-submit] Cleaned up gate responses after email failure');
        } catch (cleanupError) {
          console.error('[gate-submit] Failed to clean up gate responses:', cleanupError);
        }

        return html
          ? htmlRedirect('/?error=email_failed')
          : jsonError(500, 'Failed to send magic link email. Please try again.');
      }

      // Email accepted by the SMTP relay — now safe to mark older active
      // sessions for this user as superseded. Doing this BEFORE the email
      // succeeds would orphan the user if the send failed (they'd have no
      // active session to roll back to).
      const supersededCount = await completeSupersededSessions(emailHash, sessionId);
      if (supersededCount > 0) {
        console.log('[gate-submit] Superseded', supersededCount, 'stale active session(s)');
      }

      increment('auth.magiclink.sent');
      increment('questionnaire.started');

      console.log('[gate-submit] Magic link sent, expires:', expiresAt.toISOString());

      if (html) {
        return htmlRedirect('/check-email');
      }
      return new Response(
        JSON.stringify({
          message: 'Magic link sent',
          expiresAt: expiresAt.toISOString(),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      console.error('[gate-submit] Failed:', error);
      increment('errors.5xx');

      return html
        ? htmlRedirect('/?error=server')
        : jsonError(500, 'Failed to process submission');
    }
  },
};
