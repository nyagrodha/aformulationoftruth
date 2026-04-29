import { FreshContext } from 'fresh/server.ts';
import { z } from 'zod/mod.ts';
import { activatePaymentCode } from '../../../lib/payment-codes.ts';

const requestSchema = z.object({
  user_id: z.number().positive(),
  code: z.string().regex(/^A4OT-[A-Z0-9]{4}-[A-Z0-9]{4}$/),
});

export const handler = async (req: Request, ctx: FreshContext) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const formData = await req.formData();
    const user_id = parseInt(formData.get('user_id') as string);
    const code = formData.get('code') as string;

    const validation = requestSchema.safeParse({ user_id, code });
    if (!validation.success) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // TODO: Extract userId from JWT/session instead of request body
    if (user_id === 0) {
      return new Response(JSON.stringify({ error: 'User not authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await activatePaymentCode(code, user_id);

    if (result.success) {
      return new Response(
        JSON.stringify({
          success: true,
          message: result.message,
          tier: 'paid',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    } else {
      return new Response(JSON.stringify(result), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    console.error('Payment activation failed:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to activate payment code' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
