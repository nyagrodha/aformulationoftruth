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
  'age1jwpy3l4pdzzswm5jj3q2yax4eduf97t6wjqkyd4g6anjtffn5vrs38ag5q';

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
