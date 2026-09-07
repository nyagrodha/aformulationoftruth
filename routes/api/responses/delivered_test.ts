/**
 * Delivery-confirmation callback.
 *
 * POST /api/responses/delivered is the only writer of pdf_delivered_at. A
 * wrong-open (unset token treated as "let anyone stamp") or a wrong-closed
 * (re-stamp that moves the shred clock) is how a private key stays alive or a
 * row gets marked delivered for a session that never existed.
 *
 * Hermetic: DATABASE_URL is unparseable so the first DB touch throws. The
 * auth and validation branches return before that, so 401/400/503 here are
 * evidence that nothing was written. 500 on a well-formed request is evidence
 * the handler did not invent a success.
 *
 *   deno test --allow-env --allow-read --allow-net routes/api/responses/delivered_test.ts
 */

import { assert, assertEquals, assertStringIncludes } from '$std/assert/mod.ts';

const originalEnv = Deno.env.toObject();
const TEST_ENV_KEYS = ['RENDER_CALLBACK_TOKEN', 'DATABASE_URL'] as const;
const TOKEN = 'callback-token-32-bytes-long!!!!';
const SESSION = '11111111-2222-3333-4444-555555555555';

function setupEnv(token: string | null) {
  Deno.env.set('DATABASE_URL', '::://not-a-database');
  if (token === null) Deno.env.delete('RENDER_CALLBACK_TOKEN');
  else Deno.env.set('RENDER_CALLBACK_TOKEN', token);
}

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    Deno.env.set(key, value);
  }
  for (const key of TEST_ENV_KEYS) {
    if (!(key in originalEnv)) Deno.env.delete(key);
  }
}

async function post(
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  const { handler } = await import('./delivered.ts');
  const init: RequestInit = { method: 'POST', headers: { ...headers } };
  if (typeof body === 'string') {
    init.body = body;
    init.headers = { 'Content-Type': 'application/json', ...headers };
  } else {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json', ...headers };
  }
  return handler.POST!(new Request('http://localhost/api/responses/delivered', init), {} as never);
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

Deno.test('delivered: refuses to stamp when RENDER_CALLBACK_TOKEN is unset', async () => {
  setupEnv(null);
  try {
    const res = await post({ sessionId: SESSION }, bearer('anything-at-all'));
    assertEquals(res.status, 503);
    assertEquals((await res.json()).ok, false);
  } finally {
    restoreEnv();
  }
});

Deno.test('delivered: an empty configured token is not "open"', async () => {
  // Fail closed: empty string must not mean "no auth required".
  setupEnv('');
  try {
    const res = await post({ sessionId: SESSION });
    assertEquals(res.status, 503);
    await res.body?.cancel();
  } finally {
    restoreEnv();
  }
});

Deno.test('delivered: missing Authorization is 401, not a stamp', async () => {
  setupEnv(TOKEN);
  try {
    const res = await post({ sessionId: SESSION });
    assertEquals(res.status, 401);
    assertEquals((await res.json()).ok, false);
  } finally {
    restoreEnv();
  }
});

Deno.test('delivered: a wrong bearer of the same length is 401', async () => {
  setupEnv(TOKEN);
  try {
    const res = await post({ sessionId: SESSION }, bearer('x'.repeat(TOKEN.length)));
    assertEquals(res.status, 401);
    await res.body?.cancel();
  } finally {
    restoreEnv();
  }
});

Deno.test('delivered: a shorter bearer does not throw (length is not an oracle)', async () => {
  setupEnv(TOKEN);
  try {
    const res = await post({ sessionId: SESSION }, bearer('short'));
    assertEquals(res.status, 401);
    await res.body?.cancel();
  } finally {
    restoreEnv();
  }
});

Deno.test('delivered: "bearer" (lowercase scheme) is not accepted', async () => {
  setupEnv(TOKEN);
  try {
    const res = await post({ sessionId: SESSION }, { Authorization: `bearer ${TOKEN}` });
    assertEquals(res.status, 401);
    await res.body?.cancel();
  } finally {
    restoreEnv();
  }
});

Deno.test('delivered: unparseable JSON is 400', async () => {
  setupEnv(TOKEN);
  try {
    const res = await post('not json{', bearer(TOKEN));
    assertEquals(res.status, 400);
    await res.body?.cancel();
  } finally {
    restoreEnv();
  }
});

Deno.test('delivered: a traversal-shaped session id is 400, not a query', async () => {
  setupEnv(TOKEN);
  try {
    const res = await post({ sessionId: '../../etc/passwd' }, bearer(TOKEN));
    assertEquals(res.status, 400);
    await res.body?.cancel();
  } finally {
    restoreEnv();
  }
});

Deno.test('delivered: a numeric session id is 400', async () => {
  setupEnv(TOKEN);
  try {
    const res = await post({ sessionId: 1 }, bearer(TOKEN));
    assertEquals(res.status, 400);
    await res.body?.cancel();
  } finally {
    restoreEnv();
  }
});

Deno.test('delivered: a missing sessionId is 400', async () => {
  setupEnv(TOKEN);
  try {
    const res = await post({}, bearer(TOKEN));
    assertEquals(res.status, 400);
    await res.body?.cancel();
  } finally {
    restoreEnv();
  }
});

Deno.test('delivered: every error response is Cache-Control: no-store and carries no session id', async () => {
  setupEnv(TOKEN);
  try {
    const res = await post({ sessionId: SESSION });
    assertEquals(res.headers.get('Cache-Control'), 'no-store');
    const text = await res.text();
    assert(!text.includes(SESSION), 'the session id must not bounce back');
  } finally {
    restoreEnv();
  }
});

Deno.test('delivered: a well-formed request against an unconfigured DB is 500, not 200', async () => {
  // Positive evidence the handler did not skip the stamp and claim success.
  setupEnv(TOKEN);
  try {
    const res = await post({ sessionId: SESSION }, bearer(TOKEN));
    assertEquals(res.status, 500);
    assertEquals((await res.json()).ok, false);
  } finally {
    restoreEnv();
  }
});

Deno.test('delivered: the UPDATE is write-once — a re-send must not move pdf_delivered_at', async () => {
  const source = await Deno.readTextFile(new URL('./delivered.ts', import.meta.url));
  assertStringIncludes(source, 'AND pdf_delivered_at IS NULL');
  assertStringIncludes(source, 'SET pdf_delivered_at = NOW()');
  // Distinguishes "no such session" from "already stamped", so a duplicate
  // callback stays 200 and an unknown one is 404.
  assertStringIncludes(source, 'SELECT count(*) FROM matched');
  assertStringIncludes(source, 'SELECT count(*) FROM stamped');
});
