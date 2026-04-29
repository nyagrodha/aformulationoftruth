/**
 * Stripe Webhook Handler
 *
 * POST /api/stripe/webhook
 * Handles Stripe webhook events, primarily checkout.session.completed
 *
 * Verifies webhook signature and upgrades user to paid tier on successful payment
 */

import { FreshContext } from 'fresh/server.ts';
import Stripe from 'stripe';
import { getStripe, getWebhookSecret } from '../../../lib/stripe.ts';
import { upgradeToPaid } from '../../../lib/users.ts';

export const handler = async (req: Request, ctx: FreshContext) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Get raw body for signature verification
    const body = await req.text();
    const sig = req.headers.get('stripe-signature');

    if (!sig) {
      console.warn('[stripe-webhook] Missing signature header');
      return new Response(JSON.stringify({ error: 'Missing signature' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Verify webhook signature
    const stripe = getStripe();
    const webhookSecret = getWebhookSecret();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } catch (err) {
      console.error('[stripe-webhook] Signature verification failed:', err instanceof Error ? err.message : err);
      return new Response(JSON.stringify({ error: 'Signature verification failed' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Handle checkout.session.completed event
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;

      // Verify payment was actually completed
      if (session.payment_status !== 'paid') {
        console.warn('[stripe-webhook] Session not paid, skipping upgrade:', {
          sessionId: session.id,
          paymentStatus: session.payment_status,
        });
        return new Response(JSON.stringify({ success: true, received: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Extract user_id from client_reference_id
      const user_id = session.client_reference_id;
      if (!user_id) {
        console.warn('[stripe-webhook] No client_reference_id in checkout session');
        return new Response(JSON.stringify({ error: 'Missing user reference' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // Upgrade user to paid tier
      try {
        const upgraded = await upgradeToPaid(user_id);
        if (!upgraded) {
          console.error('[stripe-webhook] Failed to upgrade user:', user_id);
          // Return 500 so Stripe will retry
          return new Response(JSON.stringify({ error: 'Failed to upgrade user' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        console.log('[stripe-webhook] User upgraded to paid:', user_id);
      } catch (error) {
        console.error('[stripe-webhook] Error upgrading user:', user_id, error);
        // Return 500 so Stripe will retry
        return new Response(JSON.stringify({ error: 'Database error during upgrade' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Always return 200 for valid webhook (Stripe may retry otherwise)
    return new Response(JSON.stringify({ success: true, received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[stripe-webhook] Webhook processing failed:', error);
    // Return 500 so Stripe will retry
    return new Response(JSON.stringify({ error: 'Webhook processing failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
