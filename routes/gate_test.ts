/**
 * /gate is the no-JS questionnaire door. These pin the cookie contract and
 * the early exits. They do not pin what happens after a failed /api/gate
 * store — that path still advances, which is a live fail-open, not a promise.
 *
 *   deno test --allow-env --allow-read --allow-net routes/gate_test.ts
 */

import { assert, assertEquals } from '$std/assert/mod.ts';
import { handler } from './gate.tsx';

const GET = handler.GET!;
const POST = handler.POST!;

function renderCtx() {
  return {
    render(data: unknown, init?: { headers?: Headers }) {
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: init?.headers ?? new Headers(),
      });
    },
  };
}

function cookies(res: Response): string[] {
  // Deno's Headers.get joins Set-Cookie; getSetCookie is the split form.
  const split = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.();
  if (split && split.length) return split;
  const joined = res.headers.get('set-cookie') ?? '';
  return joined ? [joined] : [];
}

Deno.test('GET /gate over HTTPS marks the session cookies Secure', async () => {
  const prevDeno = Deno.env.get('DENO_ENV');
  const prevNode = Deno.env.get('NODE_ENV');
  Deno.env.delete('DENO_ENV');
  Deno.env.delete('NODE_ENV');
  try {
    const res = await GET(
      new Request('https://aformulationoftruth.com/gate'),
      // deno-lint-ignore no-explicit-any
      renderCtx() as any,
    );
    assertEquals(res.status, 200);
    const set = cookies(res);
    assert(
      set.some((c) =>
        c.startsWith('gate_token=') && c.includes('HttpOnly') && c.includes('SameSite=Strict') && c.includes('Secure')
      ),
    );
    assert(set.some((c) => c.startsWith('gate_q=') && c.includes('Secure')));
  } finally {
    if (prevDeno === undefined) Deno.env.delete('DENO_ENV');
    else Deno.env.set('DENO_ENV', prevDeno);
    if (prevNode === undefined) Deno.env.delete('NODE_ENV');
    else Deno.env.set('NODE_ENV', prevNode);
  }
});

Deno.test('GET /gate over HTTP in a non-production env omits Secure', async () => {
  const prevDeno = Deno.env.get('DENO_ENV');
  const prevNode = Deno.env.get('NODE_ENV');
  Deno.env.set('DENO_ENV', 'test');
  Deno.env.delete('NODE_ENV');
  try {
    const res = await GET(
      new Request('http://localhost/gate'),
      // deno-lint-ignore no-explicit-any
      renderCtx() as any,
    );
    const set = cookies(res);
    assert(set.some((c) => c.startsWith('gate_token=')));
    assertEquals(set.some((c) => c.includes('Secure')), false);
  } finally {
    if (prevDeno === undefined) Deno.env.delete('DENO_ENV');
    else Deno.env.set('DENO_ENV', prevDeno);
    if (prevNode === undefined) Deno.env.delete('NODE_ENV');
    else Deno.env.set('NODE_ENV', prevNode);
  }
});

Deno.test('GET /gate with a finished gate_q sends the visitor to login', async () => {
  const res = await GET(
    new Request('http://localhost/gate', { headers: { Cookie: 'gate_q=2; gate_token=gate_abc' } }),
    // deno-lint-ignore no-explicit-any
    renderCtx() as any,
  );
  assertEquals(res.status, 302);
  assertEquals(res.headers.get('location'), '/login');
});

Deno.test('GET /gate treats a garbage or negative gate_q as the first question', async () => {
  for (const cookie of ['gate_q=nope', 'gate_q=-4']) {
    const res = await GET(
      new Request('http://localhost/gate', { headers: { Cookie: cookie } }),
      // deno-lint-ignore no-explicit-any
      renderCtx() as any,
    );
    assertEquals(res.status, 200, cookie);
    const data = await res.json();
    assertEquals(data.questionIndex, 0, cookie);
  }
});

Deno.test('POST /gate without a gate_token cookie bounces home, and does not fetch', async () => {
  const originalFetch = globalThis.fetch;
  let fetched = false;
  globalThis.fetch = () => {
    fetched = true;
    return Promise.resolve(new Response(null, { status: 200 }));
  };
  try {
    const form = new FormData();
    form.set('answer', 'should not be stored');
    form.set('action', 'continue');
    const res = await POST(
      new Request('http://localhost/gate', { method: 'POST', body: form }),
      // deno-lint-ignore no-explicit-any
      {} as any,
    );
    assertEquals(res.status, 302);
    assertEquals(res.headers.get('location'), '/gate');
    assertEquals(fetched, false, 'no token means no store attempt');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
