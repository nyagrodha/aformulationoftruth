/**
 * Health Check Endpoint
 *
 * GET /api/health
 *
 * Returns database connectivity status without exposing sensitive details.
 *
 * `schema` says whether the database has every table and column the migration
 * files describe (lib/schema-check.ts). Drift answers 503 so an uptime monitor
 * goes red: in September 2026 a skipped migration left this endpoint saying ok
 * while every PDF request failed for a week. The response never names what is
 * missing -- this endpoint is public; scripts/check-schema.ts shows the names.
 */

import { Handlers } from '$fresh/server.ts';
import { isDatabaseConfigured, withConnection as realWithConnection } from '../../lib/db.ts';
import { increment } from '../../lib/metrics.ts';
import { schemaState as realSchemaState } from '../../lib/schema-check.ts';

/** Seams for health_test.ts, which runs with no database. */
export const dbForTesting: { withConnection?: typeof realWithConnection } = {};
export const schemaForTesting: { current?: typeof realSchemaState } = {};

const withConnection: typeof realWithConnection = (handler) =>
  (dbForTesting.withConnection ?? realWithConnection)(handler);

export const handler: Handlers = {
  async GET(_req, _ctx) {
    increment('requests.api');

    if (!isDatabaseConfigured()) {
      return new Response(
        JSON.stringify({ status: 'degraded', message: 'Database not configured', schema: 'unknown' }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    try {
      const result = await withConnection(async (client) => {
        const { rows } = await client.queryObject<{ now: Date }>('SELECT NOW() AS now');
        return rows[0];
      });

      // Never throws: a failed comparison is 'unknown', which is reported but
      // does not by itself fail the check -- the database answered.
      const schema = await (schemaForTesting.current ?? realSchemaState)();
      const drift = schema === 'drift';

      return new Response(
        JSON.stringify({
          status: drift ? 'degraded' : 'ok',
          databaseTime: result.now.toISOString(),
          schema,
        }),
        {
          status: drift ? 503 : 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    } catch (_error) {
      // Log error without sensitive details
      console.error('[health] Database check failed');
      increment('errors.5xx');

      return new Response(
        JSON.stringify({ status: 'error', message: 'Database unavailable', schema: 'unknown' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }
  },
};
