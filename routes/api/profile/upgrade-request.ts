import { Handlers } from '$fresh/server.ts';
import { generatePaymentCode } from '../../../lib/payment-codes.ts';
import { increment } from '../../../lib/metrics.ts';

export const handler: Handlers = {
  async POST(req, _ctx) {
    increment('requests.api');

    // TODO: Extract authenticated user_id from JWT/session
    // For now, derive from request auth headers or middleware context
    const userId = 0; // SECURITY: Replace with authenticated user ID

    if (!userId) {
      increment('errors.4xx');
      return new Response(
        JSON.stringify({ error: 'User not authenticated' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    try {
      const code = await generatePaymentCode(userId);
      increment('payment.code_generated');

      return new Response(
        JSON.stringify({
          code,
          message:
            'Include this code with your payment proof (PayPal, CashApp, or Crypto)',
          payment_methods: {
            paypal: 'support@aformulationoftruth.com',
            cashapp: '$aformulationoftruth',
            crypto: 'See your profile for addresses'
          }
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      console.error('[upgrade-request]', error);
      increment('errors.5xx');
      return new Response(
        JSON.stringify({ error: 'Failed to generate code' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }
};
