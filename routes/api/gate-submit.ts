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
import { createQuestionnaireSession, findActiveSession, deleteSession } from '../../lib/questionnaire-session.ts';
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

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      increment('errors.4xx');
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const parsed = GateSubmitSchema.safeParse(body);
    if (!parsed.success) {
      increment('errors.4xx');
      return new Response(
        JSON.stringify({ error: 'Email required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate and normalize email
    const emailValidation = validateEmail(parsed.data.email);
    if (!emailValidation.valid) {
      increment('errors.4xx');
      if (emailValidation.reason === 'suspicious_pattern') {
        increment('errors.suspicious_email');
        console.log('[gate-submit] Blocked suspicious email pattern');
      }
      return new Response(
        JSON.stringify({ error: 'Please use a valid email address' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const email = emailValidation.normalized;
    const { answer1, answer2 } = parsed.data;

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
        console.error('[gate-submit] Email failed:', emailResult.error);
        increment('errors.email');

        // Clean up orphaned records on email failure
        // 1. Clean up magic link
        await cleanupMagicLink();

        // 2. Delete the questionnaire session (this also unlinks gate responses)
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

        return new Response(
          JSON.stringify({ error: 'Failed to send magic link email. Please try again.' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }

      increment('auth.magiclink.sent');
      increment('questionnaire.started');

      console.log('[gate-submit] Magic link sent, expires:', expiresAt.toISOString());

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

      return new Response(
        JSON.stringify({ error: 'Failed to process submission' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  },
};
