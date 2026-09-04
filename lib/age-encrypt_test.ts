/**
 * Multi-recipient age encryption.
 *
 * Every questionnaire answer is encrypted to the session key AND the offline
 * break-glass key. An empty recipient list would produce a file no key on
 * earth can open; AGE_RECIPIENT has no baked-in fallback for the same reason.
 *
 *   deno test --allow-env --allow-read lib/age-encrypt_test.ts
 */

import { assertEquals, assertRejects } from '$std/assert/mod.ts';
import { armor, Decrypter, generateX25519Identity, identityToRecipient } from '@age/age-encryption';
import { ageEncrypt, ageEncryptTo } from './age-encrypt.ts';

async function open(armored: string, identity: string): Promise<string> {
  const d = new Decrypter();
  d.addIdentity(identity);
  return await d.decrypt(armor.decode(armored), 'text');
}

Deno.test('ageEncryptTo - both recipients can open the same ciphertext', async () => {
  const session = await generateX25519Identity();
  const breakglass = await generateX25519Identity();
  const armored = await ageEncryptTo('intimate answer', [
    await identityToRecipient(session),
    await identityToRecipient(breakglass),
  ]);

  assertEquals(await open(armored, session), 'intimate answer');
  assertEquals(await open(armored, breakglass), 'intimate answer');
});

Deno.test('ageEncryptTo - an unrelated identity cannot open it', async () => {
  const session = await generateX25519Identity();
  const armored = await ageEncryptTo('secret', [await identityToRecipient(session)]);
  const stranger = await generateX25519Identity();

  await assertRejects(() => open(armored, stranger));
});

Deno.test('ageEncryptTo - empty recipient list is refused', async () => {
  await assertRejects(() => ageEncryptTo('secret', []), Error, 'no recipients');
});

Deno.test('ageEncrypt - AGE_RECIPIENT is required when no recipient is passed', async () => {
  const prev = Deno.env.get('AGE_RECIPIENT');
  Deno.env.delete('AGE_RECIPIENT');
  try {
    await assertRejects(() => ageEncrypt('secret'), Error, 'AGE_RECIPIENT not configured');
  } finally {
    if (prev === undefined) Deno.env.delete('AGE_RECIPIENT');
    else Deno.env.set('AGE_RECIPIENT', prev);
  }
});
