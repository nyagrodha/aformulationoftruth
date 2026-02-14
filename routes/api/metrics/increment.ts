/**
 * Metrics Increment Endpoint
 *
 * POST /api/metrics/increment
 *
 * Privacy-safe endpoint for client-side metric beacons.
 * Only accepts allowlisted metric names to prevent abuse.
 *
 * gupta-vidya compliance:
 * - No PII in request or response
 * - Allowlisted metrics only
 * - Rate limited implicitly by aggregation
 */

import { Handlers } from '$fresh/server.ts';
import { increment } from '../../../lib/metrics.ts';

// Allowlisted metrics that can be incremented from client-side
const ALLOWED_CLIENT_METRICS = new Set([
  // Funnel metrics
  'funnel.completion.viewed',
  'funnel.gate.viewed',

  // Feature usage
  'feature.afterword.scroll_deep',
  'feature.newsletter.cta_visible',
  'feature.newsletter.cta_clicked',
  'feature.begin.cta_clicked',

  // Engagement
  'engagement.return_visit',
]);

// Shared headers for all responses — beacon endpoints should never be cached
const RESPONSE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

export const handler: Handlers = {
  async POST(req, _ctx) {
    try {
      const body = await req.json();
      const metric = body?.metric;

      // Validate metric name — return same 200 response as disallowed metrics
      // to avoid leaking allowlist information via status codes
      if (!metric || typeof metric !== 'string') {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: RESPONSE_HEADERS,
        });
      }

      // Only allow specific metrics from client-side
      if (!ALLOWED_CLIENT_METRICS.has(metric)) {
        // Silently ignore disallowed metrics (don't reveal allowlist)
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: RESPONSE_HEADERS,
        });
      }

      // Increment the metric
      increment(metric);

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: RESPONSE_HEADERS,
      });
    } catch {
      // Don't leak error details
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: RESPONSE_HEADERS,
      });
    }
  },
};
