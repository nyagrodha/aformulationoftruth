/**
 * GET /w/:token is printed on wearables. Unknown and malformed tokens must
 * 404 the same way — otherwise the page is an oracle for which tokens exist,
 * and a traversal-shaped token would be interpolated into a cookie.
 *
 * The format check runs before the database, so these tests stay hermetic
 * with an unparseable DATABASE_URL: a path that queried would be 500.
 *
 *   deno test --allow-env --allow-read routes/w/token_test.ts
 */

import { assertEquals } from '$std/assert/mod.ts';

const originalEnv = Deno.env.toObject();

function setupTestEnv() {
  Deno.env.set('DATABASE_URL', '::://not-a-database');
}

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    Deno.env.set(key, value);
  }
  if (!('DATABASE_URL' in originalEnv)) Deno.env.delete('DATABASE_URL');
}

function mockCtx(token: string) {
  let notFound = false;
  let rendered = false;
  return {
    get notFound() {
      return notFound;
    },
    get rendered() {
      return rendered;
    },
    ctx: {
      params: { token },
      renderNotFound() {
        notFound = true;
        return new Response('Not Found', { status: 404 });
      },
      render() {
        rendered = true;
        return new Response('ok', { status: 200 });
      },
    },
  };
}

async function loadHandler() {
  const { handler } = await import('./[token].tsx');
  return handler.GET!;
}

Deno.test({
  name: 'wearable: a traversal-shaped token is 404 and never queries',
  async fn() {
    setupTestEnv();
    try {
      const get = await loadHandler();
      const mock = mockCtx('../../etc/passwd');
      const response = await get(new Request('http://localhost/w/..%2F..%2Fetc%2Fpasswd'), mock.ctx as never);
      assertEquals(response.status, 404);
      assertEquals(mock.notFound, true);
      assertEquals(mock.rendered, false);
      assertEquals(response.headers.get('set-cookie'), null);
    } finally {
      restoreEnv();
    }
  },
});

Deno.test({
  name: 'wearable: too-short, too-long, and punctuation tokens are 404',
  async fn() {
    setupTestEnv();
    try {
      const get = await loadHandler();
      const hostile = [
        'short',
        'has spaces in it!!!!',
        'semicolon;rm',
        'a'.repeat(65),
        '',
        'quote\'or',
      ];
      for (const token of hostile) {
        const mock = mockCtx(token);
        const response = await get(new Request(`http://localhost/w/${encodeURIComponent(token)}`), mock.ctx as never);
        assertEquals(response.status, 404, `should 404: ${JSON.stringify(token)}`);
        assertEquals(mock.notFound, true, `should renderNotFound: ${JSON.stringify(token)}`);
        assertEquals(response.headers.get('set-cookie'), null);
      }
    } finally {
      restoreEnv();
    }
  },
});

Deno.test({
  name: 'wearable: a well-formed token that hits the database does not look like a format 404',
  async fn() {
    // A 16-char url-safe token is legal; the unparseable DATABASE_URL makes
    // withConnection throw. That 500 is the evidence the format check let it
    // through — a format reject would have been 404 without touching the pool.
    setupTestEnv();
    try {
      const get = await loadHandler();
      const mock = mockCtx('abcdefghijklmnop');
      let threw = false;
      try {
        await get(new Request('http://localhost/w/abcdefghijklmnop'), mock.ctx as never);
      } catch {
        threw = true;
      }
      assertEquals(mock.notFound, false, 'a legal token must not be rejected as malformed');
      assertEquals(threw, true, 'an unconfigured database must surface rather than 404');
    } finally {
      restoreEnv();
    }
  },
});
