/**
 * Crypto contract for /api/gate-submit.
 *
 * These pin the properties the route must hold, independent of HTTP: the
 * address is recoverable by the session identity AND by break-glass, an
 * unrelated key gets nothing, and a pushed identity can be withdrawn again
 * when the submission that justified it fails.
 *
 * Run with: deno task test
 */

import { assert, assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { armor, Decrypter } from '@age/age-encryption';
import { ageEncryptTo } from '../lib/age-encrypt.ts';
import { generateSessionKeypair, shredRemoteIdentity } from '../lib/session-keys.ts';

Deno.test('gate-submit contract - address opens with the session identity and with break-glass', async () => {
  const session = await generateSessionKeypair();
  const breakglass = await generateSessionKeypair();

  const armored = await ageEncryptTo('person@example.com', [session.recipient, breakglass.recipient]);

  for (const id of [session.identity, breakglass.identity]) {
    const d = new Decrypter();
    d.addIdentity(id);
    assertEquals(await d.decrypt(armor.decode(armored), 'text'), 'person@example.com');
  }

  assert(!armored.includes('person@example.com'), 'address must not survive in the ciphertext');
});

Deno.test('gate-submit contract - an unrelated identity recovers nothing', async () => {
  const session = await generateSessionKeypair();
  const armored = await ageEncryptTo('person@example.com', [session.recipient]);

  const stranger = new Decrypter();
  stranger.addIdentity((await generateSessionKeypair()).identity);
  let refused = false;
  try {
    await stranger.decrypt(armor.decode(armored), 'text');
  } catch {
    refused = true;
  }
  assert(refused, 'an unrelated identity must not decrypt a session ciphertext');
});

// The unwind path. A key pushed for a submission that then fails must be
// withdrawable, or the key box accumulates identities for sessions that never
// came into being.
Deno.test('shredRemoteIdentity - asks the transport to remove that session', async () => {
  const asked: string[] = [];
  await shredRemoteIdentity('11111111-2222-3333-4444-555555555555', (id) => {
    asked.push(id);
    return Promise.resolve();
  });
  assertEquals(asked, ['11111111-2222-3333-4444-555555555555']);
});

Deno.test('shredRemoteIdentity - refuses a hostile session id', async () => {
  let ran = false;
  let threw = false;
  try {
    await shredRemoteIdentity('../../etc/passwd', () => {
      ran = true;
      return Promise.resolve();
    });
  } catch {
    threw = true;
  }
  assert(threw, 'must reject an id that could escape the key directory');
  assert(!ran, 'the transport must never see a hostile id');
});

// Cleanup is best-effort by design: the caller is already failing a submission
// and must not fail differently because the withdrawal also failed. The 30-day
// absolute ceiling in the keystore is the backstop.
Deno.test('shredRemoteIdentity - swallows transport failure rather than masking the original error', async () => {
  await shredRemoteIdentity('11111111-2222-3333-4444-555555555555', () => Promise.reject(new Error('mesh down')));
});
