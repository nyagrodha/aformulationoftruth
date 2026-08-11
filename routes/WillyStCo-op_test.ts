import { assertEquals } from '$std/assert/mod.ts';
import { handler } from './WillyStCo-op.tsx';

// deno-lint-ignore no-explicit-any
const GET = (handler as any).GET as (req: Request, ctx: unknown) => Promise<Response>;

function scan(): Promise<Response> {
  const req = new Request('https://example.test/WillyStCo-op', {
    headers: { 'user-agent': 'Mozilla/5.0 (iPhone)' },
  });
  return GET(req, { remoteAddr: { hostname: '203.0.113.7' } });
}

// Must await fn before restoring. A synchronous version returns the promise
// and runs its finally immediately, tearing the variable down before the body
// ever reads it -- which makes every assertion that depends on the value fail
// for a reason that looks like a production bug.
async function withEnv<T>(key: string, value: string | null, fn: () => Promise<T>): Promise<T> {
  const prev = Deno.env.get(key);
  if (value === null) Deno.env.delete(key);
  else Deno.env.set(key, value);
  try {
    return await fn();
  } finally {
    if (prev === undefined) Deno.env.delete(key);
    else Deno.env.set(key, prev);
  }
}

// No DATABASE_URL is configured in the test environment, so recordScan throws.
// That is the point: counting must never be able to break the redirect. A
// person standing in a grocery store must not meet a 500 because the database
// blinked -- the same non-fatal rule gate-submit applies to encounters.
Deno.test('a scan redirects to the wearable page even when recording fails', async () => {
  await withEnv('COOP_WEARABLE_TOKEN', 'abcdefghijklmnop', async () => {
    const res = await scan();
    assertEquals(res.status, 302);
    assertEquals(res.headers.get('location'), '/w/abcdefghijklmnop');
  });
});

// The slug must not appear in the redirect: the URL names a place, and the
// person scanning it did not ask to be told where they are.
Deno.test('the redirect does not leak the slug', async () => {
  await withEnv('COOP_WEARABLE_TOKEN', 'abcdefghijklmnop', async () => {
    const res = await scan();
    assertEquals(res.headers.get('location')?.includes('WillySt'), false);
  });
});

// An unseeded token is an operator error, not a scanner's problem. Sending
// them to the entry ritual is better than a 404 on a printed code.
Deno.test('an unconfigured token still lands the scanner somewhere', async () => {
  await withEnv('COOP_WEARABLE_TOKEN', null, async () => {
    const res = await scan();
    assertEquals(res.status, 302);
    assertEquals(res.headers.get('location'), '/');
  });
});

Deno.test('a malformed token is rejected rather than redirected to', async () => {
  await withEnv('COOP_WEARABLE_TOKEN', '../../etc/passwd', async () => {
    const res = await scan();
    assertEquals(res.headers.get('location'), '/');
  });
});

Deno.test('the redirect is never cached, so every scan reaches the counter', async () => {
  await withEnv('COOP_WEARABLE_TOKEN', 'abcdefghijklmnop', async () => {
    const res = await scan();
    assertEquals(res.headers.get('cache-control'), 'no-store');
  });
});
