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

const GateSubmitSchema = z.object({
  email: z.string().email(),
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
        JSON.stringify({ error: 'Valid email required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { email, answer1, answer2 } = parsed.data;

    try {
      // Step 1: Generate server-side gate token
      const gateToken = crypto.randomUUID();

      // Step 2: Store gate answers
      await withConnection(async (client) => {
        const q0 = answer1.trim() || null;
        const q1 = answer2.trim() || null;

        await client.queryObject(
          `INSERT INTO fresh_gate_responses (gate_token, q0_answer, q1_answer)
           VALUES ($1, $2, $3)`,
          [gateToken, q0, q1]
        );
      });

      console.log('[gate-submit] Gate answers stored, token:', gateToken.slice(0, 8) + '...');

      // Step 3: Create magic link
      const { token: magicToken, expiresAt } = await createMagicLink(email);

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
