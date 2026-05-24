/**
 * Age x25519 encryption for server-side payloads.
 *
 * Two named recipients are supported:
 *   - 'questionnaire' : answers / gate-submission email
 *                       (env: AGE_RECIPIENT_QUESTIONNAIRE, legacy fallback: AGE_RECIPIENT)
 *   - 'messages'      : inbound contact-form submissions
 *                       (env: AGE_RECIPIENT_MESSAGES)
 *
 * gupta-vidya compliance:
 * - Public keys are safe to embed (encryption-only, cannot decrypt).
 * - Output is ASCII-armored ciphertext matching the offline pipeline's format.
 * - Source no longer carries a hard-coded default key; missing config throws.
 */

import { armor, Encrypter } from '@age/age-encryption';

export type Recipient = 'questionnaire' | 'messages';

const cache = new Map<Recipient, string>();

function resolveRecipient(recipient: Recipient): string {
  const cached = cache.get(recipient);
  if (cached) return cached;

  const primaryVar = recipient === 'questionnaire'
    ? 'AGE_RECIPIENT_QUESTIONNAIRE'
    : 'AGE_RECIPIENT_MESSAGES';

  let value = Deno.env.get(primaryVar);

  // Legacy fallback: keep existing deployments alive until the operator
  // rotates the questionnaire key into the new variable name.
  if (!value && recipient === 'questionnaire') {
    value = Deno.env.get('AGE_RECIPIENT');
  }

  if (!value) {
    throw new Error(`${primaryVar} not configured`);
  }

  cache.set(recipient, value);
  return value;
}

/**
 * Encrypt a string with age x25519 under the named recipient,
 * returning ASCII-armored ciphertext.
 * Output: -----BEGIN AGE ENCRYPTED FILE----- ... -----END AGE ENCRYPTED FILE-----
 */
export async function ageEncrypt(
  recipient: Recipient,
  plaintext: string,
): Promise<string> {
  const e = new Encrypter();
  e.addRecipient(resolveRecipient(recipient));
  const encrypted = await e.encrypt(plaintext);
  return armor.encode(encrypted);
}
