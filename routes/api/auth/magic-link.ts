/**
 * Magic Link Authentication Endpoint - WITH OPAQUE RESUME TOKEN
 *
 * POST /api/auth/magic-link
 * - Request a magic link for email authentication
 *
 * Response includes:
 * - Magic link URL with JWT + opaque resume token
 * - NO email in URL (gupta-vidya compliant)
 *
 * Flow:
 * 1. Hash email
 * 2. Create magic link (for email delivery verification)
 * 3. Create or resume questionnaire session
 * 4. Generate JWT (contains email_hash + session_id)
 * 5. Return URL: ?token=<JWT>&resume=<opaque_token>
 *
 * gupta-vidya compliance:
 * - Email used for delivery only, immediately hashed
 * - Token is capability-limited and unlinkable
 * - No durable personal state created beyond hashed email
 * - Resume token is opaque, unlinkable without server secret
 */

import { Handlers } from '$fresh/server.ts';
import { z } from 'zod';
import { createMagicLink } from '../../../lib/auth.ts';
import { hashEmail } from '../../../lib/crypto.ts';
import { createQuestionnaireSession } from '../../../lib/questionnaire-session.ts';
import { createQuestionnaireJWT } from '../../../lib/jwt.ts';
import { increment } from '../../../lib/metrics.ts';
import { sendMagicLinkEmail } from '../../../lib/email.ts';

const RequestSchema = z.object({
  email: z.string().email(),
  gateToken: z.string().optional(), // Optional gate token to link gate responses
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
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      increment('errors.4xx');
      return new Response(
        JSON.stringify({ error: 'Valid email required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    try {
      const { email, gateToken } = parsed.data;

      // Step 1: Create magic link (for email delivery verification)
      const { token: magicToken, expiresAt } = await createMagicLink(email);

      // Step 2: Hash email immediately
      const emailHash = await hashEmail(email);

      // Step 3: Create or resume questionnaire session
      // Check if user has an existing incomplete session
      // A fresh session is forced either way -- an issued resume token cannot be
      // re-derived, since session_id IS its HMAC and the token is never stored.
      // What is not forced is losing the work: createQuestionnaireSession now
      // carries a prior session's answers, progress and question order across,
      // together with the gate row holding the keypair they are sealed to.
      const sessionResult = await createQuestionnaireSession(emailHash, gateToken);
      console.log(
        sessionResult.resuming
          ? '[auth] Resuming questionnaire; prior answers carried forward'
          : '[auth] New questionnaire session',
      );

      const { opaqueToken, sessionId } = sessionResult;

      // Step 4: Create JWT (contains email_hash + session_id + via)
      //
      // 'link': this token is only ever delivered by email, and only
      // /auth/verify turns it into a cookie. See JWTVia.
      const jwt = await createQuestionnaireJWT(emailHash, sessionId, 'link');

      // Step 5: Build magic link URL with JWT + resume token
      // IMPORTANT: NO EMAIL IN URL (gupta-vidya compliant)
      const baseUrl = Deno.env.get('BASE_URL') || 'http://localhost:8000';
      const magicLinkUrl = `${baseUrl}/auth/verify?token=${jwt}&resume=${opaqueToken}`;

      // Step 6: Deliver the magic link over SMTP (same path as /api/gate-submit).
      const emailResult = await sendMagicLinkEmail(email, magicLinkUrl);
      if (!emailResult.success) {
        console.error('[auth] Email delivery failed');
        increment('errors.email');
        return new Response(
          JSON.stringify({ error: 'Failed to send magic link' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
      }

      increment('auth.magiclink.sent');

      // Log only that a link was created, not for whom
      console.log('[auth] Magic link created, expires:', expiresAt.toISOString());

      return new Response(
        JSON.stringify({
          message: 'Magic link sent',
          expiresAt: expiresAt.toISOString(),
          // Development only - remove in production
          ...(Deno.env.get('DENO_ENV') !== 'production' && {
            _devLink: magicLinkUrl,
            _devJWT: jwt,
            _devResume: opaqueToken,
            _devSessionId: sessionId,
          }),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    } catch (_error) {
      console.error('[auth] Failed to create magic link');
      increment('errors.5xx');

      return new Response(
        JSON.stringify({ error: 'Failed to send magic link' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }
  },
};
