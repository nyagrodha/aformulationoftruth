import { Handlers } from '$fresh/server.ts';
import { withTransaction } from '../../../lib/db.ts';
import { increment } from '../../../lib/metrics.ts';

export const handler: Handlers = {
  async GET(req, ctx) {
    increment('requests.api');

    const token = ctx.params.token as string;

    if (!token || token.length < 32) {
      increment('errors.4xx');
      return new Response(
        '<!DOCTYPE html><html><body><h1>Invalid Unsubscribe Link</h1><p>The unsubscribe token is missing or invalid.</p></body></html>',
        { status: 400, headers: { 'Content-Type': 'text/html' } }
      );
    }

    try {
      const result = await withTransaction(async (client) => {
        const { rows } = await client.queryObject<{ id: number }>(
          `SELECT id FROM newsletter_emails
           WHERE unsubscribe_token = $1 AND unsubscribed_at IS NULL`,
          [token]
        );

        if (rows.length === 0) {
          return {
            success: false,
            message: 'Token not found or already unsubscribed'
          };
        }

        await client.queryObject(
          `UPDATE newsletter_emails SET unsubscribed_at = NOW()
           WHERE unsubscribe_token = $1`,
          [token]
        );

        return { success: true, message: 'Successfully unsubscribed' };
      });

      if (result.success) {
        increment('newsletter.unsubscribed');
        return new Response(
          '<!DOCTYPE html><html><body><h1>Unsubscribed</h1><p>You have been removed from our newsletter.</p></body></html>',
          { status: 200, headers: { 'Content-Type': 'text/html' } }
        );
      } else {
        increment('newsletter.unsubscribe_failed');
        return new Response(
          '<!DOCTYPE html><html><body><h1>Already Unsubscribed</h1><p>This email address is not on our newsletter list, or was already unsubscribed.</p></body></html>',
          { status: 400, headers: { 'Content-Type': 'text/html' } }
        );
      }
    } catch (error) {
      console.error('[newsletter/unsubscribe]', error);
      increment('errors.5xx');
      return new Response(
        '<!DOCTYPE html><html><body><h1>Error</h1><p>An error occurred while processing your request.</p></body></html>',
        { status: 500, headers: { 'Content-Type': 'text/html' } }
      );
    }
  },
};
