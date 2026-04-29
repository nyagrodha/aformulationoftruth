import { FreshContext } from 'fresh/server.ts';
import { z } from 'zod/mod.ts';
import { deleteUserData } from '../../../lib/users.ts';
import { increment } from '../../../lib/metrics.ts';

const requestSchema = z.object({
  user_id: z.number().positive(),
});

export const handler = async (req: Request, ctx: FreshContext) => {
  if (req.method !== 'DELETE') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const validation = requestSchema.safeParse(body);

    if (!validation.success) {
      return new Response(JSON.stringify({ error: 'Invalid user ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // TODO: Extract userId from JWT/session instead of request body
    const userId = body.user_id;
    if (userId === 0) {
      return new Response(JSON.stringify({ error: 'User not authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const success = await deleteUserData(userId);

    if (success) {
      increment('user.delete');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Your data has been permanently deleted',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    } else {
      increment('user.delete_failed');
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  } catch (error) {
    console.error('User deletion failed:', error);
    increment('user.delete_failed');
    return new Response(
      JSON.stringify({ error: 'Failed to delete user data' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
