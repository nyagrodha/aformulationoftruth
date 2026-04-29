import { FreshContext } from 'fresh/server.ts';
import { z } from 'zod/mod.ts';
import { setPublicKey } from '../../../lib/users.ts';

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

    // TODO: Extract userId from JWT/session instead of request body
    if (user_id === 0) {
      return new Response(JSON.stringify({ error: 'User not authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

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
