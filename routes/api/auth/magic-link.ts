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
import { validateEmail } from '../../../lib/emailValidator.ts';
import { createMagicLink } from '../../../lib/auth.ts';
import { hashEmail } from '../../../lib/crypto.ts';
import { createQuestionnaireSession, findActiveSession } from '../../../lib/questionnaire-session.ts';
import { createQuestionnaireJWT } from '../../../lib/jwt.ts';
import { increment } from '../../../lib/metrics.ts';
import { sendMagicLinkEmail } from '../../../lib/email.ts';

const RequestSchema = z.object({
  email: z.string().min(1),
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
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const parsed = RequestSchema.safeParse(body);
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
        console.log('[auth] Blocked suspicious email pattern');
      }
      return new Response(
        JSON.stringify({ error: 'Please use a valid email address' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    try {
      const email = emailValidation.normalized;
      const { gateToken } = parsed.data;

      // Step 1: Create magic link (for email delivery verification)
      const { expiresAt } = await createMagicLink(email);

      // Step 2: Hash email immediately
      const emailHash = await hashEmail(email);

      // Step 3: Create or resume questionnaire session
      // Check if user has an existing incomplete session
      let sessionResult;
      const existingSession = await findActiveSession(emailHash);

      if (existingSession) {
        // User is resuming - create new opaque token for existing session
        // (Old token is not retrievable, so we create a new session)
        console.log('[auth] User resuming questionnaire, creating new session');
        sessionResult = await createQuestionnaireSession(emailHash, gateToken);
      } else {
        // New session
        sessionResult = await createQuestionnaireSession(emailHash, gateToken);
      }

      const { opaqueToken, sessionId } = sessionResult;

      // Step 4: Create JWT (contains email_hash + session_id)
      const jwt = await createQuestionnaireJWT(emailHash, sessionId);

      // Step 5: Build magic link URL with JWT + resume token
      // IMPORTANT: NO EMAIL IN URL (gupta-vidya compliant)
      const baseUrl = Deno.env.get('BASE_URL') || 'http://localhost:8000';
      const magicLinkUrl = `${baseUrl}/auth/verify?token=${jwt}&resume=${opaqueToken}`;

      // Send the magic link email via SendGrid
      const emailResult = await sendMagicLinkEmail(email, magicLinkUrl);
      if (!emailResult.success) {
        console.error('[auth] Failed to send magic link email:', emailResult.error);
        increment('errors.email');
        return new Response(
          JSON.stringify({ error: 'Failed to send email. Please try again.' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
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
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      console.error('[auth] Failed to create magic link:', error);
      increment('errors.5xx');

      return new Response(
        JSON.stringify({ error: 'Failed to send magic link' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  },
};
