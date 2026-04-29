import { Handlers } from '$fresh/server.ts';
import { deleteUserData } from '../../../lib/users.ts';
import { increment } from '../../../lib/metrics.ts';

export const handler: Handlers = {
  async DELETE(req, _ctx) {
    increment('requests.api');

    // TODO: Extract authenticated user_id from JWT/session
    const userId = 0; // SECURITY: Replace with authenticated user ID

    if (!userId) {
      increment('errors.4xx');
      return new Response(
        JSON.stringify({ error: 'User not authenticated' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    try {
      const result = await deleteUserData(userId);

      if (result.success) {
        increment('user.deleted');
        return new Response(
          JSON.stringify({
            success: true,
            message: result.message,
            privacy_info: {
              jurisdiction: 'Iceland',
              gdpr_compliant: true,
              notes:
                'All personal data has been permanently deleted from our servers.'
            }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      } else {
        increment('user.delete_failed');
        return new Response(
          JSON.stringify(result),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
    } catch (error) {
      console.error('[user/delete]', error);
      increment('errors.5xx');
      return new Response(
        JSON.stringify({ error: 'Deletion failed' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  },
};
