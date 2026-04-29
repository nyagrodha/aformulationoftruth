import { FreshContext } from 'fresh/server.ts';
import { z } from 'zod/mod.ts';
import { generatePaymentCode } from '../../../lib/payment-codes.ts';

const requestSchema = z.object({
  user_id: z.number().positive(),
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

    const validation = requestSchema.safeParse({ user_id });
    if (!validation.success) {
      return new Response(JSON.stringify({ error: 'Invalid user ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // TODO: SECURITY - Replace with authenticated user ID from session/JWT
    if (user_id === 0) {
      return new Response(JSON.stringify({ error: 'User not authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const code = await generatePaymentCode(user_id);

    return new Response(
      JSON.stringify({
        success: true,
        payment_code: code,
        amount: 3,
        currency: 'USD',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Payment code generation failed:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to generate payment code' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
