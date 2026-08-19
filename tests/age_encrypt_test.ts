/**
 * Multi-recipient age encryption.
 *
 * The questionnaire encrypts every answer to two recipients at once: the
 * respondent's per-session key and an offline break-glass key. These tests pin
 * that contract — in particular that BOTH identities open the same ciphertext,
 * and that an empty recipient list is refused rather than producing a file no
 * key on earth can open.
 */

import { assertEquals, assertRejects } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { armor, Decrypter, generateX25519Identity, identityToRecipient } from '@age/age-encryption';
import { ageEncryptTo } from '../lib/age-encrypt.ts';

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
