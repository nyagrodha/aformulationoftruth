import { FreshContext } from 'fresh/server.ts';
import { z } from 'zod/mod.ts';
import { updateProfile } from '../../../lib/users.ts';

const requestSchema = z.object({
  user_id: z.number().positive(),
  username: z.string().optional(),
  profile_visibility: z.enum(['private', 'public']).optional(),
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
    const username = formData.get('username') as string | null;
    const profile_visibility = formData.get('visibility') as string | null;

    const validation = requestSchema.safeParse({
      user_id,
      username: username || undefined,
      profile_visibility: profile_visibility || undefined,
    });

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

    const updates: { username?: string; profile_visibility?: 'private' | 'public' } = {};
    if (username) updates.username = username;
    if (profile_visibility) {
      updates.profile_visibility = profile_visibility as 'private' | 'public';
    }

    const success = await updateProfile(user_id, updates);

    if (success) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Profile updated successfully',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    } else {
      return new Response(
        JSON.stringify({ error: 'Failed to update profile' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  } catch (error) {
    console.error('Profile update failed:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to update profile' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
