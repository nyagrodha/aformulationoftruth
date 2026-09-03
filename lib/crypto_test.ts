/**
 * Crypto helpers the rest of the site takes as given.
 *
 * hmacKey's non-extractability is the audience counter's "the salt does not
 * outlive the window" claim: if the key can be exported, the raw bytes are
 * still in the process after the buffer is zeroed. hashEmail's normalisation
 * is what makes "one respondent per mailbox" true rather than decorative.
 *
 *   deno test --allow-env lib/crypto_test.ts
 */

import { assert, assertEquals, assertRejects } from '$std/assert/mod.ts';
import {
  decrypt,
  deriveKey,
  encrypt,
  hashEmail,
  hmacKey,
  hmacSign,
  hmacVerify,
  isTimestampValid,
  randomBytes,
} from './crypto.ts';

Deno.test('hmacKey is not extractable — the audience salt cannot be read back', async () => {
  const raw = randomBytes(32);
  const key = await hmacKey(raw);
  raw.fill(0);
  assertEquals(key.extractable, false);
  await assertRejects(() => crypto.subtle.exportKey('raw', key));
});

Deno.test('hashEmail lowercases and trims, so the same mailbox is one hash', async () => {
  assertEquals(await hashEmail('  Alex@Example.COM  '), await hashEmail('alex@example.com'));
  assert((await hashEmail('alex@example.com')).length === 64);
});

Deno.test('encrypt/decrypt round-trips and a wrong key fails closed', async () => {
  const salt = randomBytes(16);
  const key = await deriveKey('passphrase', salt);
  const other = await deriveKey('other', salt);
  const cipher = await encrypt('intimate answer', key);
  assertEquals(await decrypt(cipher, key), 'intimate answer');
  await assertRejects(() => decrypt(cipher, other));
});

Deno.test('hmacVerify rejects a truncated signature without throwing', async () => {
  const secret = randomBytes(32);
  const sig = await hmacSign('payload', secret);
  assertEquals(await hmacVerify('payload', sig, secret), true);
  assertEquals(await hmacVerify('payload', sig.slice(0, 8), secret), false);
  assertEquals(await hmacVerify('other', sig, secret), false);
});

Deno.test('isTimestampValid rejects a stamp outside the window', () => {
  const now = Date.now();
  assertEquals(isTimestampValid(now, 1000), true);
  assertEquals(isTimestampValid(now - 5000, 1000), false);
});
