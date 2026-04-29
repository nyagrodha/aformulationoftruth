import { FreshContext } from 'fresh/server.ts';
import { z } from 'zod/mod.ts';
import { setPublicKey } from '../../../lib/users.ts';
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

    // TODO: Implement server-side key generation or return instructions for client
    // For now, return a response indicating that keys need to be set up
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Encryption setup initiated',
        next_step: 'Contact support to complete encryption setup',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Encryption setup failed:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to setup encryption' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
