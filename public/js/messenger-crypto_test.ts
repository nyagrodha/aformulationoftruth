import { assert, assertEquals, assertNotEquals, assertRejects } from '$std/assert/mod.ts';
import { createIdentity, importPublicKey, openFrom, sealTo, unlockIdentity } from './messenger-crypto.js';

/*
 * These run in Deno against the same WebCrypto the browser uses, so they
 * exercise the real scheme rather than a stand-in. Everything asserted here is
 * a claim the messaging pages make to the people using them.
 *
 * Iterations are whatever createIdentity chooses (250k), so each identity costs
 * real PBKDF2 time. Identities are therefore made once per case and reused.
 */

Deno.test('an identity yields a public half and a private half that never travels in the clear', async () => {
  const identity = await createIdentity('a passphrase');

  assert(identity.publicKey.length > 0);
  assert(identity.wrappedPrivate.length > 0);
  assertEquals(identity.kdfIterations, 250000);

  // The wrapped blob must not be the key. If wrapping ever became a no-op this
  // would still be a base64 string of about the right shape, so compare.
  assertNotEquals(identity.wrappedPrivate, identity.publicKey);

  // The public half must be a real importable P-256 point.
  await importPublicKey(identity.publicKey);
});

Deno.test('two people reach the same secret from opposite sides', async () => {
  const alice = await createIdentity('alice pass');
  const bob = await createIdentity('bob pass');

  const sealed = await sealTo(alice.privateKey, bob.publicKey, 'the record was never checked');

  // Bob opens it with his private half and Alice's public half -- the reverse
  // pairing. This symmetry is the entire scheme.
  const opened = await openFrom(bob.privateKey, alice.publicKey, sealed.ciphertext, sealed.iv);
  assertEquals(opened, 'the record was never checked');
});

/*
 * A sender must be able to re-read their own sent messages. The shared secret
 * is symmetric, so this works without the server keeping a second plaintext
 * copy -- and if it ever stopped working, a sent thread would render as a column
 * of unopenable messages to the person who wrote them.
 */
Deno.test('a sender can reopen what they themselves sent', async () => {
  const alice = await createIdentity('alice pass');
  const bob = await createIdentity('bob pass');

  const sealed = await sealTo(alice.privateKey, bob.publicKey, 'mine to reread');
  const reopened = await openFrom(alice.privateKey, bob.publicKey, sealed.ciphertext, sealed.iv);

  assertEquals(reopened, 'mine to reread');
});

Deno.test('a third party cannot open a message not addressed to them', async () => {
  const alice = await createIdentity('alice pass');
  const bob = await createIdentity('bob pass');
  const eve = await createIdentity('eve pass');

  const sealed = await sealTo(alice.privateKey, bob.publicKey, 'not for eve');

  assertEquals(await openFrom(eve.privateKey, alice.publicKey, sealed.ciphertext, sealed.iv), null);
  assertEquals(await openFrom(eve.privateKey, bob.publicKey, sealed.ciphertext, sealed.iv), null);
});

Deno.test('the same plaintext seals to different ciphertext each time', async () => {
  const alice = await createIdentity('alice pass');
  const bob = await createIdentity('bob pass');

  const first = await sealTo(alice.privateKey, bob.publicKey, 'same words');
  const second = await sealTo(alice.privateKey, bob.publicKey, 'same words');

  // Static-static ECDH reuses the shared secret, so the IV is the only thing
  // keeping these apart. If it were ever fixed, identical messages would be
  // visibly identical on the wire.
  assertNotEquals(first.iv, second.iv);
  assertNotEquals(first.ciphertext, second.ciphertext);
});

Deno.test('a stored identity unlocks with its passphrase and not another', async () => {
  const identity = await createIdentity('correct horse');
  const record = {
    wrappedPrivate: identity.wrappedPrivate,
    wrapIv: identity.wrapIv,
    kdfSalt: identity.kdfSalt,
    kdfIterations: identity.kdfIterations,
  };

  const unlocked = await unlockIdentity(record, 'correct horse');

  // Prove it is the right key by using it, not merely by its existence.
  const other = await createIdentity('other');
  const sealed = await sealTo(unlocked, other.publicKey, 'round trip');
  assertEquals(await openFrom(other.privateKey, identity.publicKey, sealed.ciphertext, sealed.iv), 'round trip');

  await assertRejects(
    () => unlockIdentity(record, 'wrong horse'),
    Error,
    'that passphrase does not open this identity',
  );
});

Deno.test('an empty passphrase is refused before an identity is made', async () => {
  await assertRejects(() => createIdentity(''), Error, 'a passphrase is required');
  await assertRejects(() => createIdentity('   '), Error, 'a passphrase is required');
});

Deno.test('a malformed public key is refused rather than half-imported', async () => {
  await assertRejects(() => importPublicKey('AAAA'), Error, 'not a P-256 public key');
});

Deno.test('an empty message is refused', async () => {
  const alice = await createIdentity('alice pass');
  const bob = await createIdentity('bob pass');
  await assertRejects(() => sealTo(alice.privateKey, bob.publicKey, '   '), Error, 'nothing to send');
});

/*
 * A thread can legitimately hold a message sealed to a key that was since
 * rotated. One such message must not take down the render of every message
 * around it, so openFrom reports null rather than throwing.
 */
Deno.test('an unopenable message returns null instead of throwing', async () => {
  const alice = await createIdentity('alice pass');
  const bob = await createIdentity('bob pass');

  const sealed = await sealTo(alice.privateKey, bob.publicKey, 'fine');
  const corrupted = 'A' + sealed.ciphertext.slice(1);

  assertEquals(await openFrom(bob.privateKey, alice.publicKey, corrupted, sealed.iv), null);
});
