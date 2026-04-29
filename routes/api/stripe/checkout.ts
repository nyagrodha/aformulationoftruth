/**
 * Stripe Checkout Session Creation
 *
 * POST /api/stripe/checkout
 * Creates a Stripe Checkout Session for $3 USD payment
 *
 * Auth: JWT in Authorization: Bearer header
 * Returns: { url: 'https://checkout.stripe.com/...' } for redirect
 */

import { FreshContext } from 'fresh/server.ts';
import { verifyQuestionnaireJWT } from '../../../lib/jwt.ts';
import { getStripe, PAYMENT_AMOUNT_CENTS, CURRENCY } from '../../../lib/stripe.ts';

export const handler = async (req: Request, ctx: FreshContext) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Extract JWT from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing authentication token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.slice(7);

    // Verify JWT and extract user_id
    const payload = await verifyQuestionnaireJWT(token);
    if (!payload || !payload.user_id) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const user_id = payload.user_id;
    const baseUrl = Deno.env.get('BASE_URL') || 'http://localhost:8000';

    // Create Stripe Checkout Session
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      client_reference_id: user_id, // Link to user without extra DB storage
      customer_email: undefined, // Could fetch from DB if needed
      line_items: [
        {
          price_data: {
            currency: CURRENCY,
            product_data: {
              name: 'A Formulation of Truth - Paid Tier',
              description: 'Unlock encrypted responses and public profile features',
            },
            unit_amount: PAYMENT_AMOUNT_CENTS,
          },
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/upgrade?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/upgrade?canceled=true`,
    });

    return new Response(
      JSON.stringify({
        success: true,
        url: session.url,
        sessionId: session.id,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[stripe] Checkout session creation failed:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to create checkout session' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
