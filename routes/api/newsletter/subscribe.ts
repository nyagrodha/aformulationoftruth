/**
 * Newsletter Subscribe Endpoint
 *
 * POST /api/newsletter/subscribe
 * - Accepts email address
 * - Creates pending subscription
 * - Sends confirmation email (double opt-in)
 *
 * Two callers, two answers. The contact page's script posts JSON and reads
 * JSON back, as it always has. With scripting off, the same form posts itself
 * urlencoded and gets a 303 to /newsletter?status=…, which says what happened —
 * the site works without JavaScript and this form must too. The statuses
 * passed to land() must match NEWSLETTER_MESSAGES in routes/newsletter.tsx.
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

/** Where a script-less form post is sent to read its outcome. */
function land(status: 'check' | 'subscribed' | 'invalid' | 'error'): Response {
  return new Response(null, { status: 303, headers: { Location: `/newsletter?status=${status}` } });
}

export const handler: Handlers = {
  async POST(req, _ctx) {
    increment('requests.api');

    const isJson = (req.headers.get('content-type') || '').includes('application/json');

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': req.headers.get('origin') || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json',
    };

    let body: unknown;
    try {
      if (isJson) {
        body = await req.json();
      } else {
        const email = (await req.formData()).get('email');
        body = { email: typeof email === 'string' ? email : '' };
      }
    } catch {
      increment('errors.4xx');
      if (!isJson) return land('invalid');
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid JSON body' }),
        { status: 400, headers: corsHeaders },
      );
    }

    const parsed = SubscribeSchema.safeParse(body);
    if (!parsed.success) {
      increment('errors.4xx');
      if (!isJson) return land('invalid');
      return new Response(
        JSON.stringify({ success: false, error: 'Email required' }),
        { status: 400, headers: corsHeaders },
      );
    }

    // Validate and normalize email
    const emailValidation = validateEmail(parsed.data.email);
    if (!emailValidation.valid) {
      increment('errors.4xx');
      if (emailValidation.reason === 'suspicious_pattern') {
        increment('errors.suspicious_email');
      }
      if (!isJson) return land('invalid');
      return new Response(
        JSON.stringify({ success: false, error: 'Please use a valid email address' }),
        { status: 400, headers: corsHeaders },
      );
    }

    const email = emailValidation.normalized;

    try {
      const result = await subscribeEmail(email);

      if (result.status === 'already_confirmed') {
        if (!isJson) return land('subscribed');
        return new Response(
          JSON.stringify({
            success: true,
            message: 'You are already subscribed to the newsletter.',
            status: 'already_confirmed',
          }),
          { status: 200, headers: corsHeaders },
        );
      }

      // Send confirmation email
      if (result.confirmationToken && result.unsubscribeToken) {
        const baseUrl = Deno.env.get('BASE_URL') || 'https://aformulationoftruth.com';
        const confirmUrl = `${baseUrl}/api/newsletter/confirm?token=${result.confirmationToken}`;
        const unsubscribeUrl = `${baseUrl}/api/newsletter/unsubscribe?token=${result.unsubscribeToken}`;

        const emailResult = await sendNewsletterConfirmationEmail(email, confirmUrl, unsubscribeUrl);

        if (!emailResult.success) {
          console.error('[newsletter] Failed to send confirmation email');
          increment('errors.email');
          if (!isJson) return land('error');
          return new Response(
            JSON.stringify({ success: false, error: 'Failed to send confirmation email. Please try again.' }),
            { status: 500, headers: corsHeaders },
          );
        }
      }

      increment('newsletter.subscribe');
      console.log('[newsletter] Confirmation email sent for subscription');

      if (!isJson) return land('check');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Please check your email to confirm your subscription.',
          status: result.status,
        }),
        { status: 200, headers: corsHeaders },
      );
    } catch (error) {
      console.error('[newsletter] Subscribe failed');
      increment('errors.5xx');

      if (!isJson) return land('error');
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to process subscription' }),
        { status: 500, headers: corsHeaders },
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
