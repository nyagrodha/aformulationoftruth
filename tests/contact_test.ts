/**
 * Contact Form Secure Messaging Tests
 *
 * HTTP integration test against a running dev server (TEST_BASE_URL).
 * The server must have CONTACT_AGE_RECIPIENT set for the success cases.
 *
 * Tests are designed to be tolerant of an in-flight rate-limit bucket from
 * earlier runs: the rate-limit assertion uses its own counter and tolerates a
 * starting count > 0.
 *
 * Run with: deno task test
 */

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.208.0/assert/mod.ts';

const BASE_URL = Deno.env.get('TEST_BASE_URL') || 'http://localhost:8000';
const SERVER_HAS_AGE_RECIPIENT =
  Deno.env.get('CONTACT_AGE_RECIPIENT_SET_ON_SERVER') === 'true';

console.log(`
===========================================
Contact Form Test Suite
===========================================
Target: ${BASE_URL}
CONTACT_AGE_RECIPIENT on server: ${SERVER_HAS_AGE_RECIPIENT}
===========================================
`);

async function post(body: unknown): Promise<Response> {
  return await fetch(`${BASE_URL}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

Deno.test('Contact - 503 when CONTACT_AGE_RECIPIENT is unset', async () => {
  if (SERVER_HAS_AGE_RECIPIENT) {
    console.log('  [skip] server has CONTACT_AGE_RECIPIENT set');
    return;
  }
  const res = await post({ message: 'hello', pgpEncrypted: false });
  assertEquals(res.status, 503);
  const data = await res.json();
  assertEquals(data.success, false);
  await res.body?.cancel();
});

Deno.test('Contact - empty message rejected', async () => {
  if (!SERVER_HAS_AGE_RECIPIENT) {
    console.log('  [skip] needs CONTACT_AGE_RECIPIENT set on server');
    return;
  }
  const res = await post({ message: '', pgpEncrypted: false });
  assertEquals(res.status, 400);
  await res.body?.cancel();
});

Deno.test('Contact - whitespace-only message rejected', async () => {
  if (!SERVER_HAS_AGE_RECIPIENT) {
    console.log('  [skip] needs CONTACT_AGE_RECIPIENT set on server');
    return;
  }
  const res = await post({ message: '   \n\t  ', pgpEncrypted: false });
  assertEquals(res.status, 400);
  await res.body?.cancel();
});

Deno.test('Contact - oversized message rejected', async () => {
  if (!SERVER_HAS_AGE_RECIPIENT) {
    console.log('  [skip] needs CONTACT_AGE_RECIPIENT set on server');
    return;
  }
  const res = await post({
    message: 'x'.repeat(10_001),
    pgpEncrypted: false,
  });
  assertEquals(res.status, 400);
  await res.body?.cancel();
});

Deno.test('Contact - pgpEncrypted=true without armor rejected', async () => {
  if (!SERVER_HAS_AGE_RECIPIENT) {
    console.log('  [skip] needs CONTACT_AGE_RECIPIENT set on server');
    return;
  }
  const res = await post({
    message: 'not a pgp block',
    pgpEncrypted: true,
  });
  assertEquals(res.status, 400);
  const data = await res.json();
  assertStringIncludes(String(data.error), 'PGP');
});

Deno.test('Contact - plaintext path succeeds and reports success', async () => {
  if (!SERVER_HAS_AGE_RECIPIENT) {
    console.log('  [skip] needs CONTACT_AGE_RECIPIENT set on server');
    return;
  }
  const res = await post({
    message: `test message ${Date.now()}`,
    pgpEncrypted: false,
  });
  // If a previous run exhausted the rate limit we get 429; that is acceptable
  // here — the rate-limit test below covers the limit behaviour explicitly.
  assert(
    res.status === 200 || res.status === 429,
    `unexpected status ${res.status}`,
  );
  if (res.status === 200) {
    const data = await res.json();
    assertEquals(data.success, true);
    // Server must NOT echo the message back.
    assertEquals(typeof (data as { message?: unknown }).message, 'undefined');
  } else {
    await res.body?.cancel();
  }
});

Deno.test('Contact - PGP path with valid armor succeeds', async () => {
  if (!SERVER_HAS_AGE_RECIPIENT) {
    console.log('  [skip] needs CONTACT_AGE_RECIPIENT set on server');
    return;
  }
  const fakePgp =
    '-----BEGIN PGP MESSAGE-----\n\nVGVzdCBwYXlsb2FkIGZvciBlbnZlbG9wZSBjaGVjaw==\n-----END PGP MESSAGE-----';
  const res = await post({ message: fakePgp, pgpEncrypted: true });
  assert(
    res.status === 200 || res.status === 429,
    `unexpected status ${res.status}`,
  );
  if (res.status === 200) {
    const data = await res.json();
    assertEquals(data.success, true);
  } else {
    await res.body?.cancel();
  }
});

Deno.test('Contact - rate-limit triggers 429 after the cap', async () => {
  if (!SERVER_HAS_AGE_RECIPIENT) {
    console.log('  [skip] needs CONTACT_AGE_RECIPIENT set on server');
    return;
  }
  // Fire enough requests in a tight loop to be sure we exceed any reasonable
  // window: the server caps at 5 / hour / IP. Capture the first 429 we see.
  let saw429 = false;
  let retryAfterPresent = false;
  for (let i = 0; i < 12; i++) {
    const res = await post({
      message: `flood-${i}-${Date.now()}`,
      pgpEncrypted: false,
    });
    if (res.status === 429) {
      saw429 = true;
      retryAfterPresent = res.headers.get('Retry-After') !== null;
      await res.body?.cancel();
      break;
    }
    await res.body?.cancel();
  }
  assert(saw429, 'expected a 429 response within the rate-limit burst');
  assert(retryAfterPresent, 'expected a Retry-After header on the 429');
});
