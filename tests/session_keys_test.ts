/**
 * Per-session age keypairs.
 *
 * These tests pin two things that are easy to regress and expensive to notice:
 * that every session really does get its own key (a cached or module-level
 * keypair would silently make the whole scheme pointless), and that a transport
 * failure never carries key material into an error message.
 */

import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { armor, Decrypter } from '@age/age-encryption';
import { ageEncryptTo } from '../lib/age-encrypt.ts';
import { generateSessionKeypair, pushIdentity } from '../lib/session-keys.ts';

Deno.test('generateSessionKeypair - keypair is usable and unique per call', async () => {
  const a = await generateSessionKeypair();
  const b = await generateSessionKeypair();

  assert(a.identity.startsWith('AGE-SECRET-KEY-'));
  assert(a.recipient.startsWith('age1'));
  assert(a.identity !== b.identity, 'each session must get its own key');

  const armored = await ageEncryptTo('answer', [a.recipient]);
  const d = new Decrypter();
  d.addIdentity(a.identity);
  assertEquals(await d.decrypt(armor.decode(armored), 'text'), 'answer');
});

Deno.test('pushIdentity - hands the identity to the transport', async () => {
  const seen: Array<{ id: string; key: string }> = [];
  await pushIdentity('sess-1', 'AGE-SECRET-KEY-TEST', (id, key) => {
    seen.push({ id, key });
    return Promise.resolve();
  });
  assertEquals(seen, [{ id: 'sess-1', key: 'AGE-SECRET-KEY-TEST' }]);
});

Deno.test('pushIdentity - a failing transport propagates (fails closed)', async () => {
  await assertRejects(
    () => pushIdentity('sess-1', 'AGE-SECRET-KEY-TEST', () => Promise.reject(new Error('mesh down'))),
    Error,
  );
});

Deno.test('pushIdentity - transport failure message carries no key material', async () => {
  const err = await pushIdentity('sess-1', 'AGE-SECRET-KEY-LEAKME', () => Promise.reject(new Error('boom')))
    .then(() => null, (e: Error) => e);
  assert(err !== null);
  assert(!err.message.includes('LEAKME'), 'key material must never reach an error message');
});
