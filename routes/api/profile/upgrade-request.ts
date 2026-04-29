import { FreshContext } from 'fresh/server.ts';
import { z } from 'zod/mod.ts';
import { generatePaymentCode } from '../../../lib/payment-codes.ts';
import { verifyQuestionnaireJWT } from '../../../lib/jwt.ts';

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
    } else {
      // Try to get token from form data for backward compatibility
      const formData = await req.formData();
      token = formData.get('token') as string | null;
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
