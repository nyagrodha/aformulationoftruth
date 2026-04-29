/**
 * Age x25519 encryption for email addresses
 *
 * Uses the same public key as the Rust Gate service so that
 * the offline pipeline can decrypt both answers and emails
 * with a single private key.
 *
 * gupta-vidya compliance:
 * - Public key is safe to embed (encryption-only, cannot decrypt)
 * - Produces ASCII-armored ciphertext matching Gate's format
 */

import { Encrypter, armor } from '@age/age-encryption';

const AGE_RECIPIENT = Deno.env.get('AGE_RECIPIENT') ||
  'age1x060v073jaf6pwz7pw66pdtt4eu7zp7sh9yayj0f4nfpktv3zg2shket77';

/**
 * Encrypt a string with age x25519, returning ASCII-armored ciphertext.
 * Output format: -----BEGIN AGE ENCRYPTED FILE----- ... -----END AGE ENCRYPTED FILE-----
 */
export async function ageEncrypt(plaintext: string): Promise<string> {
  const e = new Encrypter();
  e.addRecipient(AGE_RECIPIENT);
  const encrypted = await e.encrypt(plaintext);
  return armor.encode(encrypted);
}
