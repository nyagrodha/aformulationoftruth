/**
 * Newsletter Subscribe Endpoint
 *
 * POST /api/newsletter/subscribe
 * - Accepts email address
 * - Creates pending subscription
 * - Sends confirmation email (double opt-in)
 *
 * gupta-vidya compliance:
 * - Email used for confirmation only, immediately hashed for storage
 * - No email content logged
 */

import { Handlers } from '$fresh/server.ts';
import { z } from 'zod';
import { validateEmail } from '../../../lib/emailValidator.ts';
import { subscribeEmail } from '../../../lib/newsletter.ts';
import { sendNewsletterConfirmationEmail } from '../../../lib/email.ts';
import { increment } from '../../../lib/metrics.ts';

const SubscribeSchema = z.object({
  email: z.string().min(1),
});

export const handler: Handlers = {
  async POST(req, _ctx) {
    increment('requests.api');

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': req.headers.get('origin') || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json',
    };

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      increment('errors.4xx');
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: corsHeaders }
      );
    }

    const parsed = SubscribeSchema.safeParse(body);
    if (!parsed.success) {
      increment('errors.4xx');
      return new Response(
        JSON.stringify({ error: 'Email required' }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate and normalize email
    const emailValidation = validateEmail(parsed.data.email);
    if (!emailValidation.valid) {
      increment('errors.4xx');
      if (emailValidation.reason === 'suspicious_pattern') {
        increment('errors.suspicious_email');
      }
      return new Response(
        JSON.stringify({ error: 'Please use a valid email address' }),
        { status: 400, headers: corsHeaders }
      );
    }

    const email = emailValidation.normalized;

    try {
      const result = await subscribeEmail(email);

      if (result.status === 'already_confirmed') {
        return new Response(
          JSON.stringify({
            message: 'You are already subscribed to the newsletter.',
            status: 'already_confirmed',
          }),
          { status: 200, headers: corsHeaders }
        );
      }

      // Send confirmation email
      if (result.confirmationToken && result.unsubscribeToken) {
        const baseUrl = Deno.env.get('BASE_URL') || 'https://aformulationoftruth.com';
        const confirmUrl = `${baseUrl}/api/newsletter/confirm?token=${result.confirmationToken}`;
        const unsubscribeUrl = `${baseUrl}/api/newsletter/unsubscribe?token=${result.unsubscribeToken}`;

        const emailResult = await sendNewsletterConfirmationEmail(email, confirmUrl, unsubscribeUrl);

        if (!emailResult.success) {
          console.error('[newsletter] Failed to send confirmation email:', emailResult.error);
          increment('errors.email');
          return new Response(
            JSON.stringify({ error: 'Failed to send confirmation email. Please try again.' }),
            { status: 500, headers: corsHeaders }
          );
        }
      }

      increment('newsletter.subscribe');
      console.log('[newsletter] Confirmation email sent for subscription');

      return new Response(
        JSON.stringify({
          message: 'Please check your email to confirm your subscription.',
          status: result.status,
        }),
        { status: 200, headers: corsHeaders }
      );
    } catch (error) {
      console.error('[newsletter] Subscribe failed:', error);
      increment('errors.5xx');

      return new Response(
        JSON.stringify({ error: 'Failed to process subscription' }),
        { status: 500, headers: corsHeaders }
      );
    }
  },

  // Handle CORS preflight
  OPTIONS(_req, _ctx) {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  },
};
