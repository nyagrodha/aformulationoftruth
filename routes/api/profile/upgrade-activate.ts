import { Handlers } from '$fresh/server.ts';
import { z } from 'zod';
import {
  activatePaymentCode,
  validatePaymentCode
} from '../../../lib/payment-codes.ts';
import { increment } from '../../../lib/metrics.ts';

const ActivateSchema = z.object({
  code: z.string().regex(/^A4OT-[A-Z0-9]{4}-[A-Z0-9]{4}$/),
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
        JSON.stringify({ error: 'Invalid JSON' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const parsed = ActivateSchema.safeParse(body);
    if (!parsed.success) {
      increment('errors.4xx');
      return new Response(
        JSON.stringify({ error: 'Invalid code format' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // TODO: Extract authenticated user_id from JWT/session
    const userId = 0; // SECURITY: Replace with authenticated user ID

    if (!userId) {
      increment('errors.4xx');
      return new Response(
        JSON.stringify({ error: 'User not authenticated' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { code } = parsed.data;

    try {
      const valid = await validatePaymentCode(code);
      if (!valid) {
        increment('payment.activation_failed');
        return new Response(
          JSON.stringify({
            upgraded: false,
            message: 'Invalid or already-used code'
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const result = await activatePaymentCode(code, userId);

      if (result.upgraded) {
        increment('payment.user_upgraded');
        return new Response(
          JSON.stringify({
            upgraded: true,
            message: result.message,
            next_step: 'Set up X25519 encryption in your profile'
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      } else {
        increment('payment.activation_failed');
        return new Response(
          JSON.stringify({ upgraded: false, message: result.message }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
    } catch (error) {
      console.error('[upgrade-activate]', error);
      increment('errors.5xx');
      return new Response(
        JSON.stringify({ error: 'Activation failed' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  },
};
