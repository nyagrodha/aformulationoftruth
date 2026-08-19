/**
 * Age x25519 encryption for short messages and PII fragments.
 *
 * Default recipient (AGE_RECIPIENT) is the gate's age public key, shared with
 * the Rust Gate service so the offline pipeline can decrypt gate answers and
 * gate-submitted emails with one private key.
 *
 * Callers that need a *different* recipient (e.g. the contact-form rollout,
 * which uses CONTACT_AGE_RECIPIENT for key isolation) pass it explicitly as
 * the second argument.
 *
 * gupta-vidya compliance:
 * - Public key is safe to embed (encryption-only, cannot decrypt)
 * - Produces ASCII-armored ciphertext matching Gate's format
 */

import { armor, Encrypter } from '@age/age-encryption';

/**
 * The gate's age recipient. REQUIRED -- there is deliberately no baked-in
 * default.
 *
 * A hardcoded fallback is how production drifted: the recipient was rotated by
 * editing this constant on the server and never committing, so the repo named
 * a stale key while the running service used another, and read-gate-answers.ts
 * grew a multi-identity loop to cope with ciphertext from "several key eras".
 * A missing variable must stop the service, not silently encrypt to whatever
 * was last committed -- data encrypted to a key nobody holds is unrecoverable.
 */
function requireRecipient(): string {
  const r = Deno.env.get('AGE_RECIPIENT');
  if (!r) throw new Error('AGE_RECIPIENT not configured');
  return r;
}

/**
 * Encrypt a string with age x25519, returning ASCII-armored ciphertext.
 * Output format: -----BEGIN AGE ENCRYPTED FILE----- ... -----END AGE ENCRYPTED FILE-----
 *
 * @param plaintext  data to encrypt
 * @param recipient  optional age recipient string (defaults to AGE_RECIPIENT)
 */
export async function ageEncrypt(
  plaintext: string,
  recipient?: string,
): Promise<string> {
  const e = new Encrypter();
  e.addRecipient(recipient ?? requireRecipient());
  const encrypted = await e.encrypt(plaintext);
  return armor.encode(encrypted);
}

/**
 * Encrypt to several recipients at once. Any one of their identities opens the
 * result; none of them can be derived from the ciphertext.
 *
 * Used for per-session encryption, where every answer goes to the respondent's
 * session key AND the offline break-glass key. Refusing an empty list matters:
 * age would otherwise produce a file nobody on earth can decrypt, and the
 * failure would not surface until someone tried to read it months later.
 */
export async function ageEncryptTo(
  plaintext: string,
  recipients: string[],
): Promise<string> {
  if (recipients.length === 0) {
    throw new Error('ageEncryptTo: no recipients');
  }
  const e = new Encrypter();
  for (const r of recipients) e.addRecipient(r);
  return armor.encode(await e.encrypt(plaintext));
}
