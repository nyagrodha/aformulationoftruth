/**
 * Public Metrics Endpoint
 *
 * GET /api/metrics
 *
 * gupta-vidya compliance:
 * - Raw numeric counts only
 * - Hour-bucketed aggregation
 * - Cannot reverse-engineer user behavior
 * - Safe to publish publicly
 * - No IP, user agent, request IDs, or correlatable identifiers
 */

import { Handlers } from '$fresh/server.ts';
import { getCurrentHourMetrics, getHistoricalMetrics } from '../../lib/metrics.ts';

export const handler: Handlers = {
  GET(_req, _ctx) {
    const current = getCurrentHourMetrics();
    const historical = getHistoricalMetrics();

    // Response is intentionally public and cacheable
    return new Response(
      JSON.stringify({
        currentHour: current,
        history: historical,
        _note: 'Aggregated counts only. No individual user data.',
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=60', // Cache for 1 minute
        },
      }
    );
  },
};
