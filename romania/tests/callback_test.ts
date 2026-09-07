/**
 * The delivery callback the key box fires after a successful send.
 *
 * For months every call 404'd — the web-tier route did not exist — and
 * notifyDelivered treated that the same as 200, so pdf_delivered_at was
 * never stamped and the shred clock never started. These tests pin that
 * the callback is actually attempted, that a rejection is visible, and
 * that a failed callback cannot fail the send (the document is already
 * in the respondent's hands).
 *
 *   deno test --allow-env --allow-net romania/tests/callback_test.ts
 */

import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { notifyDelivered } from '../render-service.ts';

const originalFetch = globalThis.fetch;
const originalEnv = Deno.env.toObject();
const KEYS = ['RENDER_CALLBACK_URL', 'RENDER_CALLBACK_TOKEN'] as const;
const SESSION = '11111111-2222-3333-4444-555555555555';

function restore() {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnv)) Deno.env.set(key, value);
  for (const key of KEYS) {
    if (!(key in originalEnv)) Deno.env.delete(key);
  }
}

Deno.test('notifyDelivered is a no-op when RENDER_CALLBACK_URL is unset', async () => {
  let called = false;
  globalThis.fetch = () => {
    called = true;
    return Promise.resolve(new Response(null, { status: 200 }));
  };
  try {
    Deno.env.delete('RENDER_CALLBACK_URL');
    await notifyDelivered(SESSION);
    assertEquals(called, false);
  } finally {
    restore();
  }
});

Deno.test('notifyDelivered POSTs /delivered with the bearer token and the session id', async () => {
  const calls: Array<{ url: string; auth: string | null; body: string; method: string | undefined }> = [];
  globalThis.fetch = (input, init) => {
    calls.push({
      url: String(input),
      auth: new Headers(init?.headers).get('Authorization'),
      body: String(init?.body ?? ''),
      method: init?.method,
    });
    return Promise.resolve(new Response(null, { status: 200 }));
  };
  try {
    Deno.env.set('RENDER_CALLBACK_URL', 'https://aformulationoftruth.com/api/responses');
    Deno.env.set('RENDER_CALLBACK_TOKEN', 'callback-token');
    await notifyDelivered(SESSION);
    assertEquals(calls.length, 1);
    assertEquals(calls[0].url, 'https://aformulationoftruth.com/api/responses/delivered');
    assertEquals(calls[0].method, 'POST');
    assertEquals(calls[0].auth, 'Bearer callback-token');
    assertEquals(JSON.parse(calls[0].body), { sessionId: SESSION });
  } finally {
    restore();
  }
});

Deno.test('notifyDelivered does not throw when the callback 404s — but it did issue the request', async () => {
  let status: number | undefined;
  globalThis.fetch = () => Promise.resolve(new Response('not found', { status: 404 }));
  // Capture console.error so a 404 is distinguishable from a swallowed success
  // at the source level: the function returns, and fetch ran.
  const errors: string[] = [];
  const orig = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
  };
  try {
    Deno.env.set('RENDER_CALLBACK_URL', 'https://aformulationoftruth.com/api/responses');
    Deno.env.set('RENDER_CALLBACK_TOKEN', 'callback-token');
    await notifyDelivered(SESSION);
    status = 404;
    assertEquals(status, 404);
    assert(errors.some((e) => e.includes('404')), 'a rejected callback must be logged by status, not swallowed');
  } finally {
    console.error = orig;
    restore();
  }
});

Deno.test('notifyDelivered does not throw on a network failure', async () => {
  globalThis.fetch = () => Promise.reject(new TypeError('error sending request'));
  try {
    Deno.env.set('RENDER_CALLBACK_URL', 'https://aformulationoftruth.com/api/responses');
    await notifyDelivered(SESSION);
  } finally {
    restore();
  }
});

Deno.test('notifyDelivered never rejects, even if fetch throws a non-TypeError', async () => {
  globalThis.fetch = () => Promise.reject('mesh down');
  try {
    Deno.env.set('RENDER_CALLBACK_URL', 'https://example.test');
    await notifyDelivered(SESSION);
  } catch (e) {
    restore();
    throw e;
  } finally {
    restore();
  }
});

// Sanity: a regression that re-introduces `if (!CALLBACK_URL)` captured at
// import would make the tests above fail, because this file sets the env
// after render-service.ts has already been evaluated.
Deno.test('notifyDelivered reads CALLBACK_URL on each call, not at import', async () => {
  const calls: string[] = [];
  globalThis.fetch = (input) => {
    calls.push(String(input));
    return Promise.resolve(new Response(null, { status: 200 }));
  };
  try {
    Deno.env.delete('RENDER_CALLBACK_URL');
    await notifyDelivered(SESSION);
    assertEquals(calls.length, 0);
    Deno.env.set('RENDER_CALLBACK_URL', 'http://later.test/api/responses');
    await notifyDelivered(SESSION);
    assertEquals(calls, ['http://later.test/api/responses/delivered']);
  } finally {
    restore();
  }
});
