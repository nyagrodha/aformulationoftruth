/**
 * Resume-token hashing and email hashing: the properties that make a stolen
 * session row useless without the server secret, and that keep addresses out
 * of the database.
 *
 * Split from crypto_test.ts so this file does not collide with the open
 * coverage PR that pins hmacKey extractability.
 *
 *   deno test --allow-env --allow-read lib/crypto_resume_test.ts
 */

import { assert, assertEquals, assertRejects } from '$std/assert/mod.ts';
import { hashEmail, hashResumeToken, hmacVerify, isTimestampValid, randomBytes, sha256 } from './crypto.ts';

Deno.test('hashEmail - lowercases and trims, then SHA-256s', async () => {
  const a = await hashEmail('  Person@Example.COM ');
  const b = await hashEmail('person@example.com');
  const expected = await sha256('person@example.com');
  assertEquals(a, b);
  assertEquals(a, expected);
  assertEquals(a.length, 64);
  assert(!a.includes('@'), 'the address must not survive in the hash');
});

Deno.test('hashResumeToken - fail closed without a secret, and a rotation unlinks sessions', async () => {
  const prev = Deno.env.get('RESUME_TOKEN_SECRET');
  try {
    Deno.env.delete('RESUME_TOKEN_SECRET');
    await assertRejects(() => hashResumeToken('aabbccdd'), Error, 'RESUME_TOKEN_SECRET not configured');

    Deno.env.set('RESUME_TOKEN_SECRET', 'secret-a');
    const a = await hashResumeToken('opaque-token');
    Deno.env.set('RESUME_TOKEN_SECRET', 'secret-b');
    const b = await hashResumeToken('opaque-token');
    assert(a !== b, 'a stolen session row must not verify under a rotated secret');
  } finally {
    if (prev === undefined) Deno.env.delete('RESUME_TOKEN_SECRET');
    else Deno.env.set('RESUME_TOKEN_SECRET', prev);
  }
});

Deno.test('hmacVerify - length mismatch is false, not an exception', async () => {
  const key = randomBytes(32);
  assertEquals(await hmacVerify('data', 'short', key), false);
});

Deno.test('hmacVerify - a wrong signature is false', async () => {
  const key = randomBytes(32);
  const other = randomBytes(32);
  const { hmacSign } = await import('./crypto.ts');
  const sig = await hmacSign('data', other);
  assertEquals(await hmacVerify('data', sig, key), false);
});

Deno.test('isTimestampValid - a stamp older than the window is rejected', () => {
  assertEquals(isTimestampValid(Date.now() - 6 * 60 * 1000, 5 * 60 * 1000), false);
  assertEquals(isTimestampValid(Date.now(), 5 * 60 * 1000), true);
});
