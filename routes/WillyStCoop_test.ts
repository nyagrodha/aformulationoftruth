import { assertEquals } from '$std/assert/mod.ts';
import { handler } from './WillyStCoop.tsx';

// deno-lint-ignore no-explicit-any
const GET = (handler as any).GET as (req: Request, ctx: unknown) => Response;

function visit(): Response {
  const req = new Request('https://example.test/WillyStCoop', {
    headers: { 'user-agent': 'Mozilla/5.0 (iPhone)' },
  });
  return GET(req, { remoteAddr: { hostname: '203.0.113.7' } });
}

Deno.test('WillyStCoop - redirects to the hyphenated canonical route', () => {
  const res = visit();
  assertEquals(res.status, 302);
  assertEquals(res.headers.get('location'), '/WillyStCo-op');
});

// The whole point of forwarding instead of copying: this alias must not touch
// the counter. If it ever grows a recordScan call, one QR's scans split across
// two slug rows and both numbers silently understate the truth.
Deno.test('WillyStCoop - does not redirect straight to a wearable token', () => {
  const location = visit().headers.get('location') ?? '';
  assertEquals(
    location.startsWith('/w/'),
    false,
    'must forward to the canonical slug so scans are counted exactly once',
  );
});

Deno.test('WillyStCoop - is not cached, matching the canonical route', () => {
  assertEquals(visit().headers.get('cache-control'), 'no-store');
});

// No database is configured in the test environment. The canonical route has to
// tolerate that (its counter is deadline-bounded); this one must never depend on
// it at all, so a redirect issued with no DATABASE_URL is the assertion.
Deno.test('WillyStCoop - works with no database configured', () => {
  const prev = Deno.env.get('DATABASE_URL');
  Deno.env.delete('DATABASE_URL');
  try {
    assertEquals(visit().status, 302);
  } finally {
    if (prev !== undefined) Deno.env.set('DATABASE_URL', prev);
  }
});
