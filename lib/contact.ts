/**
 * Contact-form secure messaging.
 *
 * Every submitted message is age-encrypted at rest using a *dedicated*
 * recipient (CONTACT_AGE_RECIPIENT) — separate from the gate's age key, so a
 * compromise of one private key does not unseal the other.
 *
 * If the user opted in to client-side PGP encryption before submitting, the
 * message arriving here is already a PGP armored block; we treat it as opaque
 * text and still wrap it in age. Net on-disk shape: age(pgp(plaintext)).
 *
 * gupta-vidya compliance:
 * - No email, IP, user-agent, request-id, or session column.
 * - Plaintext exists only in the request scope, then is replaced by ciphertext
 *   on its way to the database.
 */

import { withConnection } from './db.ts';
import { ageEncrypt } from './age-encrypt.ts';

export interface StoreContactMessageParams {
  message: string;
  pgpInner: boolean;
}

/**
 * Thrown when CONTACT_AGE_RECIPIENT is unset/empty. Routes map this to 503.
 * Distinct error type so the route can detect it without string-matching.
 */
export class ContactRecipientNotConfiguredError extends Error {
  constructor() {
    super('CONTACT_AGE_RECIPIENT not configured');
    this.name = 'ContactRecipientNotConfiguredError';
  }
}

/**
 * Age-encrypt the message to CONTACT_AGE_RECIPIENT and store the ciphertext.
 *
 * Read the env var at call time (not module load) so an operator can flip the
 * key in without restarting the server.
 *
 * Returns the inserted row id (for caller-side logging only — never echoed to
 * the client).
 */
export async function storeContactMessage(
  params: StoreContactMessageParams,
): Promise<number> {
  const recipient = Deno.env.get('CONTACT_AGE_RECIPIENT');
  if (!recipient) {
    throw new ContactRecipientNotConfiguredError();
  }

  const encrypted = await ageEncrypt(params.message, recipient);

  return await withConnection(async (client) => {
    const { rows } = await client.queryObject<{ id: number }>(
      `INSERT INTO contact_messages (encrypted_payload, pgp_inner)
       VALUES ($1, $2)
       RETURNING id`,
      [encrypted, params.pgpInner],
    );
    return rows[0].id;
  });
}
