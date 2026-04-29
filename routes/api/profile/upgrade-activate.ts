import { FreshContext } from 'fresh/server.ts';
import { z } from 'zod/mod.ts';
import { activatePaymentCode } from '../../../lib/payment-codes.ts';
import { verifyQuestionnaireJWT } from '../../../lib/jwt.ts';

const requestSchema = z.object({
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
    // Extract JWT from Authorization header or request body
    const authHeader = req.headers.get('Authorization');
    let token: string | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }

    const formData = await req.formData();
    const code = formData.get('code') as string;

    if (!token) {
      token = formData.get('token') as string | null;
    }

    const validation = requestSchema.safeParse({ code });
    if (!validation.success) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing authentication token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Verify JWT and extract user_id
    const payload = await verifyQuestionnaireJWT(token);
    if (!payload || !payload.user_id) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const user_id = payload.user_id;
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
