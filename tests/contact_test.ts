/**
 * Contact Form Secure Messaging Tests
 *
 * HTTP integration test against a running dev server (TEST_BASE_URL).
 * The server has a baked-in default CONTACT_AGE_RECIPIENT, so these tests
 * exercise the live path without any env-var setup.
 *
 * Tests tolerate a rate-limit bucket that may carry over from previous runs:
 * 200/429 are both treated as "passing" for the happy-path cases; the
 * dedicated rate-limit test specifically drives the limit.
 *
 * Run with: deno task test
 */

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from 'https://deno.land/std@0.208.0/assert/mod.ts';

const BASE_URL = Deno.env.get('TEST_BASE_URL') || 'http://localhost:8000';

console.log(`
===========================================
Contact Form Test Suite
===========================================
Target: ${BASE_URL}
===========================================
`);

async function post(body: unknown): Promise<Response> {
  return await fetch(`${BASE_URL}/api/contact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

Deno.test('Contact - empty message rejected', async () => {
  const res = await post({ message: '', pgpEncrypted: false });
  assertEquals(res.status, 400);
  await res.body?.cancel();
});

Deno.test('Contact - whitespace-only message rejected', async () => {
  const res = await post({ message: '   \n\t  ', pgpEncrypted: false });
  assertEquals(res.status, 400);
  await res.body?.cancel();
});

Deno.test('Contact - oversized message rejected', async () => {
  const res = await post({
    message: 'x'.repeat(10_001),
    pgpEncrypted: false,
  });
  assertEquals(res.status, 400);
  await res.body?.cancel();
});

Deno.test('Contact - pgpEncrypted=true without armor rejected', async () => {
  const res = await post({
    message: 'not a pgp block',
    pgpEncrypted: true,
  });
  assertEquals(res.status, 400);
  const data = await res.json();
  assertStringIncludes(String(data.error), 'PGP');
});

Deno.test('Contact - plaintext path succeeds and reports success', async () => {
  const res = await post({
    message: `test message ${Date.now()}`,
    pgpEncrypted: false,
  });
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
