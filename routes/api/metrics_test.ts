/**
 * GET /api/metrics is public. It may publish counts; it must not publish
 * anything that names a visitor.
 *
 *   deno test --allow-env --allow-read --allow-net routes/api/metrics_test.ts
 */

import { assert, assertEquals } from '$std/assert/mod.ts';
import { increment } from '../../lib/metrics.ts';
import { handler } from './metrics.ts';

const GET = handler.GET!;

Deno.test('GET /api/metrics publishes only aggregated counts', async () => {
  increment('test.coverage.metrics_canary', 3);

  const res = await GET(
    new Request('http://localhost/api/metrics'),
    // deno-lint-ignore no-explicit-any
    {} as any,
  );
  assertEquals(res.status, 200);
  assertEquals(res.headers.get('content-type'), 'application/json');
  assertEquals(res.headers.get('cache-control'), 'public, max-age=60');

  const body = await res.json();
  assertEquals(typeof body.currentHour, 'object');
  assert(Array.isArray(body.history));
  assertEquals(body.currentHour['test.coverage.metrics_canary'], 3);

  const dumped = JSON.stringify(body);
  for (const banned of ['email', 'user_agent', 'userAgent', 'client_ip', 'ip_address', 'session_id']) {
    assertEquals(
      Object.keys(body.currentHour).some((k) => k.includes(banned)),
      false,
      `currentHour must not grow a ${banned} key`,
    );
    assert(!dumped.includes(`"${banned}"`), `response must not name ${banned}`);
  }
});
