/**
 * Health Check Endpoint
 *
 * GET /api/health
 *
 * Returns database connectivity status without exposing sensitive details.
 */

import { Handlers } from '$fresh/server.ts';
import { withConnection, isDatabaseConfigured } from '../../lib/db.ts';
import { increment } from '../../lib/metrics.ts';

export const handler: Handlers = {
  async GET(_req, _ctx) {
    increment('requests.api');

    if (!isDatabaseConfigured()) {
      return new Response(
        JSON.stringify({ status: 'degraded', message: 'Database not configured' }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    try {
      const result = await withConnection(async (client) => {
        const { rows } = await client.queryObject<{ now: Date }>('SELECT NOW() AS now');
        return rows[0];
      });

      return new Response(
        JSON.stringify({
          status: 'ok',
          databaseTime: result.now.toISOString(),
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    } catch (error) {
      // Log error without sensitive details
      console.error('[health] Database check failed');
      increment('errors.5xx');

      return new Response(
        JSON.stringify({ status: 'error', message: 'Database unavailable' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  },
};
