/**
 * POST /api/metrics/increment is a public beacon. Anyone can hit it.
 *
 * The allowlist is the whole of the defence: a name that is not listed must
 * not move a counter, and the response must look identical either way so the
 * list cannot be walked by status code. These tests pin that, because a
 * widened or leaky allowlist is how a stranger poisons the funnel numbers
 * the daily report treats as truth.
 *
 *   deno test --allow-env --allow-read routes/api/metrics/increment_test.ts
 */

import { assert, assertEquals } from '$std/assert/mod.ts';
import { getCurrentHourMetrics } from '../../../lib/metrics.ts';
import { handler } from './increment.ts';

function post(body: unknown): Request {
  return new Request('http://localhost/api/metrics/increment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function postMetric(body: unknown): Promise<Response> {
  return await handler.POST!(post(body), {} as never);
}

function countOf(name: string): number {
  return getCurrentHourMetrics()[name] ?? 0;
}

Deno.test('an allowlisted metric is counted', async () => {
  const before = countOf('engagement.return_visit');
  const res = await postMetric({ metric: 'engagement.return_visit' });
  assertEquals(res.status, 200);
  assertEquals(res.headers.get('cache-control'), 'no-store');
  assertEquals(await res.json(), { ok: true });
  assertEquals(countOf('engagement.return_visit'), before + 1);
});

Deno.test('a name that is not on the allowlist is a silent no-op', async () => {
  const name = 'not.a.client.metric';
  const before = countOf(name);
  const res = await postMetric({ metric: name });
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true });
  assertEquals(countOf(name), before, 'a stranger must not be able to mint a counter');
});

Deno.test('a server-only funnel name cannot be incremented from the client', async () => {
  // q1_answered is a real metric — written by the gate when someone answers.
  // It is deliberately absent from the beacon allowlist: otherwise anyone
  // could invent a conversion.
  const before = countOf('funnel.gate.q1_answered');
  const res = await postMetric({ metric: 'funnel.gate.q1_answered' });
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true });
  assertEquals(countOf('funnel.gate.q1_answered'), before);
});

Deno.test('allowed and disallowed responses are indistinguishable', async () => {
  const allowed = await postMetric({ metric: 'funnel.gate.viewed' });
  const denied = await postMetric({ metric: 'errors.5xx' });
  const a = { status: allowed.status, body: await allowed.json(), cache: allowed.headers.get('cache-control') };
  const b = { status: denied.status, body: await denied.json(), cache: denied.headers.get('cache-control') };
  assertEquals(a, b);
  assertEquals(a, { status: 200, body: { ok: true }, cache: 'no-store' });
});

Deno.test('unparseable JSON is 200, not an error that leaks the parser', async () => {
  const res = await postMetric('not json{');
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { ok: true });
});

Deno.test('a non-string or missing metric is ignored', async () => {
  const before = countOf('funnel.completion.viewed');
  for (const body of [{}, { metric: '' }, { metric: 12 }, { metric: ['funnel.completion.viewed'] }]) {
    const res = await postMetric(body);
    assertEquals(res.status, 200);
    assertEquals(await res.json(), { ok: true });
  }
  assertEquals(countOf('funnel.completion.viewed'), before);
});

Deno.test('the allowlist is exact names, not a prefix', async () => {
  const source = await Deno.readTextFile(new URL('./increment.ts', import.meta.url));
  assert(
    source.includes('ALLOWED_CLIENT_METRICS.has(metric)'),
    'membership must be exact; startsWith would let funnel.gate.viewed.extra through',
  );
});
