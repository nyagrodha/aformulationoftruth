/**
 * Contact form: validation, PGP envelope sanity, and the rate-limit identity
 * that used to be forgeable via X-Forwarded-For.
 *
 * The live-server suite in tests/contact_test.ts cannot run in CI. These
 * exercise the handler directly. storeContactMessage is only reached on the
 * 503 path (unset recipient), which throws before Postgres.
 *
 *   deno test --allow-env --allow-read --allow-net routes/api/contact_test.ts
 */

import { assertEquals, assertStringIncludes } from '$std/assert/mod.ts';
import { handler } from './contact.ts';

// These tests pin the unset-recipient path. Clear the variable once so
// parallel cases cannot restore it out from under each other.
const originalContactRecipient = Deno.env.get('CONTACT_AGE_RECIPIENT');
Deno.env.delete('CONTACT_AGE_RECIPIENT');
globalThis.addEventListener('unload', () => {
  if (originalContactRecipient === undefined) Deno.env.delete('CONTACT_AGE_RECIPIENT');
  else Deno.env.set('CONTACT_AGE_RECIPIENT', originalContactRecipient);
});

function ctxFor(ip: string): never {
  return { remoteAddr: { hostname: ip } } as never;
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

async function submit(
  ip: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return await handler.POST!(post(body, headers), ctxFor(ip));
}

Deno.test('contact - empty message rejected', async () => {
  const res = await submit(crypto.randomUUID(), { message: '', pgpEncrypted: false });
  assertEquals(res.status, 400);
  await res.body?.cancel();
});

Deno.test('contact - whitespace-only message rejected', async () => {
  const res = await submit(crypto.randomUUID(), { message: '   \n\t  ', pgpEncrypted: false });
  assertEquals(res.status, 400);
  await res.body?.cancel();
});

Deno.test('contact - oversized message rejected', async () => {
  const res = await submit(crypto.randomUUID(), {
    message: 'x'.repeat(10_001),
    pgpEncrypted: false,
  });
  assertEquals(res.status, 400);
  await res.body?.cancel();
});

Deno.test('contact - invalid JSON rejected', async () => {
  const req = new Request('http://localhost/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not json{',
  });
  const res = await handler.POST!(req, ctxFor(crypto.randomUUID()));
  assertEquals(res.status, 400);
  assertEquals((await res.json()).error, 'Invalid JSON body');
});

Deno.test('contact - pgpEncrypted=true without armor rejected', async () => {
  const res = await submit(crypto.randomUUID(), {
    message: 'not a pgp block',
    pgpEncrypted: true,
  });
  assertEquals(res.status, 400);
  const data = await res.json();
  assertStringIncludes(String(data.error), 'PGP');
});

Deno.test('contact - a refused store does not echo the message', async () => {
  const res = await submit(crypto.randomUUID(), {
    message: 'please do not put this in the response',
    pgpEncrypted: false,
  });
  // Unset recipient is 503; the body must still not echo the plaintext.
  assertEquals(res.status, 503);
  const text = await res.text();
  assertEquals(text.includes('please do not put this in the response'), false);
});

Deno.test('contact - unset CONTACT_AGE_RECIPIENT is 503, not a silent store', async () => {
  const res = await submit(crypto.randomUUID(), {
    message: 'a real message',
    pgpEncrypted: false,
  });
  assertEquals(res.status, 503);
  const data = await res.json();
  assertEquals(data.success, false);
  assertStringIncludes(String(data.error), 'not configured');
});

Deno.test('contact - rate limit is 429 with Retry-After after five submissions', async () => {
  const ip = crypto.randomUUID();
  for (let i = 0; i < 5; i++) {
    const res = await submit(ip, { message: `m${i}`, pgpEncrypted: false });
    // 503 (unset recipient) still counts against the bucket: the check
    // happens before storage.
    assertEquals(res.status, 503);
    await res.body?.cancel();
  }
  const limited = await submit(ip, { message: 'one too many', pgpEncrypted: false });
  assertEquals(limited.status, 429);
  assertEquals(limited.headers.get('Retry-After') !== null, true);
  await limited.body?.cancel();
});

// THE FORGERY CASE. Without TRUST_PROXY, a client-supplied X-Forwarded-For
// must not mint a fresh rate-limit bucket. That is how the contact form's
// 5/hour cap was bypassable before the private copy of getClientIp was deleted.
Deno.test('contact - forged X-Forwarded-For does not bypass the rate limit', async () => {
  const socket = crypto.randomUUID();
  const prevTrust = Deno.env.get('TRUST_PROXY');
  Deno.env.delete('TRUST_PROXY');
  try {
    for (let i = 0; i < 5; i++) {
      const res = await submit(
        socket,
        { message: `m${i}`, pgpEncrypted: false },
        { 'X-Forwarded-For': `198.51.100.${i}` },
      );
      assertEquals(res.status, 503);
      await res.body?.cancel();
    }
    const limited = await submit(
      socket,
      { message: 'forged identity', pgpEncrypted: false },
      { 'X-Forwarded-For': '203.0.113.9' },
    );
    assertEquals(limited.status, 429, 'a new XFF value must not be a new identity');
    await limited.body?.cancel();
  } finally {
    if (prevTrust === undefined) Deno.env.delete('TRUST_PROXY');
    else Deno.env.set('TRUST_PROXY', prevTrust);
  }
});
