/**
 * Handing a delivery bundle to the key box.
 *
 * pushBundle is fail-closed: any miss (unconfigured, unreachable, non-2xx)
 * becomes KeyboxUnavailableError, and that error is contentless so a log
 * line cannot carry the questionnaire. A success that is not actually a
 * success is how a respondent is told "your copy is on its way" for a
 * document that never left the process.
 *
 *   deno test --allow-env --allow-net lib/romania-client_test.ts
 */

import { assert, assertEquals, assertRejects } from '$std/assert/mod.ts';
import { keyboxConfigured, KeyboxUnavailableError, pushBundle } from './romania-client.ts';

const originalEnv = Deno.env.toObject();
const KEYS = ['KEYBOX_RENDER_URL', 'KEYBOX_RENDER_TOKEN'] as const;
const originalFetch = globalThis.fetch;

const BUNDLE = {
  sessionId: '11111111-2222-3333-4444-555555555555',
  answers: [],
  encryptedEmail: 'AGE-CIPHERTEXT-NOT-FOR-LOGS',
  encryptedPassword: null,
};

function restore() {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnv)) Deno.env.set(key, value);
  for (const key of KEYS) {
    if (!(key in originalEnv)) Deno.env.delete(key);
  }
}

function configure() {
  Deno.env.set('KEYBOX_RENDER_URL', 'http://keybox.test');
  Deno.env.set('KEYBOX_RENDER_TOKEN', 'render-token');
}

Deno.test('keyboxConfigured is false until both URL and token are set', () => {
  try {
    Deno.env.delete('KEYBOX_RENDER_URL');
    Deno.env.delete('KEYBOX_RENDER_TOKEN');
    assertEquals(keyboxConfigured(), false);
    Deno.env.set('KEYBOX_RENDER_URL', 'http://keybox.test');
    assertEquals(keyboxConfigured(), false);
    Deno.env.set('KEYBOX_RENDER_TOKEN', 'render-token');
    assertEquals(keyboxConfigured(), true);
  } finally {
    restore();
  }
});

Deno.test('pushBundle throws KeyboxUnavailableError when the key box is unconfigured', async () => {
  try {
    Deno.env.delete('KEYBOX_RENDER_URL');
    Deno.env.delete('KEYBOX_RENDER_TOKEN');
    await assertRejects(() => pushBundle(BUNDLE), KeyboxUnavailableError);
  } finally {
    restore();
  }
});

Deno.test('pushBundle POSTs the bundle to /render with the bearer token', async () => {
  configure();
  const calls: Array<{ url: string; auth: string | null; body: string }> = [];
  globalThis.fetch = (input, init) => {
    calls.push({
      url: String(input),
      auth: new Headers(init?.headers).get('Authorization'),
      body: String(init?.body ?? ''),
    });
    return Promise.resolve(new Response(null, { status: 200 }));
  };
  try {
    await pushBundle(BUNDLE);
    assertEquals(calls.length, 1);
    assertEquals(calls[0].url, 'http://keybox.test/render');
    assertEquals(calls[0].auth, 'Bearer render-token');
    assertEquals(JSON.parse(calls[0].body).sessionId, BUNDLE.sessionId);
  } finally {
    restore();
  }
});

Deno.test('pushBundle treats a non-2xx as unavailable, not as delivered', async () => {
  configure();
  globalThis.fetch = () => Promise.resolve(new Response('nope', { status: 404 }));
  try {
    await assertRejects(() => pushBundle(BUNDLE), KeyboxUnavailableError);
  } finally {
    restore();
  }
});

Deno.test('pushBundle treats a network failure as unavailable', async () => {
  configure();
  globalThis.fetch = () => Promise.reject(new TypeError('error sending request'));
  try {
    await assertRejects(() => pushBundle(BUNDLE), KeyboxUnavailableError);
  } finally {
    restore();
  }
});

Deno.test('KeyboxUnavailableError never carries the bundle or the session id', async () => {
  configure();
  globalThis.fetch = () => Promise.reject(new TypeError('error sending request'));
  try {
    const err = await pushBundle(BUNDLE).then(() => null, (e) => e as Error);
    assert(err instanceof KeyboxUnavailableError);
    assertEquals(err.message, 'key box unavailable');
    assert(!err.message.includes(BUNDLE.sessionId));
    assert(!err.message.includes('AGE-CIPHERTEXT'));
  } finally {
    restore();
  }
});
