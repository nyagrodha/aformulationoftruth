/**
 * Questionnaire page authentication.
 *
 * GET/POST /questionnaire must not serve or advance a session without a valid
 * JWT cookie. The missing-cookie and forged-token paths return before any
 * database lookup, so these stay hermetic: no Postgres, no JWT that verifies.
 *
 *   deno test --allow-env --allow-read routes/questionnaire_auth_test.ts
 */

import { assertEquals } from '$std/assert/mod.ts';
import { handler } from './questionnaire.tsx';

// deno-lint-ignore no-explicit-any
const GET = (handler as any).GET as (req: Request, ctx: unknown) => Promise<Response>;
// deno-lint-ignore no-explicit-any
const POST = (handler as any).POST as (req: Request, ctx: unknown) => Promise<Response>;

function withEnv<T>(key: string, value: string | null, fn: () => Promise<T>): Promise<T> {
  const prev = Deno.env.get(key);
  if (value === null) Deno.env.delete(key);
  else Deno.env.set(key, value);
  return fn().finally(() => {
    if (prev === undefined) Deno.env.delete(key);
    else Deno.env.set(key, prev);
  });
}

Deno.test('GET without a jwt cookie bounces to /', async () => {
  const res = await GET(new Request('https://example.test/questionnaire'), {});
  assertEquals(res.status, 302);
  assertEquals(res.headers.get('Location'), '/');
});

Deno.test('POST without a jwt cookie bounces to / and stores nothing', async () => {
  const res = await POST(
    new Request('https://example.test/questionnaire', {
      method: 'POST',
      body: new URLSearchParams({ answer: 'intimate', action: 'continue' }),
    }),
    {},
  );
  assertEquals(res.status, 302);
  assertEquals(res.headers.get('Location'), '/');
});

Deno.test('GET with a forged jwt cookie bounces to /', async () => {
  await withEnv('JWT_SECRET', 'test-secret-for-questionnaire-auth-bounce', async () => {
    const res = await GET(
      new Request('https://example.test/questionnaire', {
        headers: { Cookie: 'jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.not-a-signature' },
      }),
      {},
    );
    assertEquals(res.status, 302);
    assertEquals(res.headers.get('Location'), '/');
  });
});

Deno.test('POST with a forged jwt cookie bounces to /', async () => {
  await withEnv('JWT_SECRET', 'test-secret-for-questionnaire-auth-bounce', async () => {
    const res = await POST(
      new Request('https://example.test/questionnaire', {
        method: 'POST',
        headers: { Cookie: 'jwt=not-a-real-jwt' },
        body: new URLSearchParams({ answer: 'intimate', action: 'continue' }),
      }),
      {},
    );
    assertEquals(res.status, 302);
    assertEquals(res.headers.get('Location'), '/');
  });
});

Deno.test('the bounce does not put the token on the Location', async () => {
  await withEnv('JWT_SECRET', 'test-secret-for-questionnaire-auth-bounce', async () => {
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.forged';
    const res = await GET(
      new Request('https://example.test/questionnaire', {
        headers: { Cookie: `jwt=${token}` },
      }),
      {},
    );
    assertEquals((res.headers.get('Location') ?? '').includes(token), false);
    assertEquals(res.headers.get('Location'), '/');
  });
});
