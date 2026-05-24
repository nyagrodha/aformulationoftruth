/**
 * Messages Service
 *
 * Stores authenticated user-sent messages, age-encrypted under the
 * 'messages' recipient. Only the offline operator with the matching
 * messages_ private key can read the encrypted fields.
 *
 * Sender and recipient identity are stored as plaintext SHA-256 hashes
 * (same hash already used elsewhere in fresh_*) so the operator can
 * correlate messages with profiles when triaging offline. A NULL
 * recipient_email_hash currently means "to the operator" — once per-user
 * keypairs ship, populated values will route to other users.
 */

import { withConnection } from './db.ts';
import { ageEncrypt } from './age-encrypt.ts';
import { validateEmail } from './emailValidator.ts';

export interface StoreMessageInput {
  senderEmailHash: string;
  recipientEmailHash?: string;
  name?: string;
  replyTo?: string;
  body: string;
}

export type StoreMessageResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'invalid_reply_to' | 'invalid_body' };

const MAX_NAME = 200;
const MAX_REPLY_TO = 320;
const MAX_BODY = 20000;
const HASH_HEX_LEN = 64;

function looksLikeHash(value: string): boolean {
  return value.length === HASH_HEX_LEN && /^[0-9a-f]+$/.test(value);
}

export async function storeMessage(
  input: StoreMessageInput,
): Promise<StoreMessageResult> {
  if (!looksLikeHash(input.senderEmailHash)) {
    return { ok: false, reason: 'invalid_body' };
  }
  if (input.recipientEmailHash && !looksLikeHash(input.recipientEmailHash)) {
    return { ok: false, reason: 'invalid_body' };
  }

  const body = input.body?.trim() ?? '';
  if (!body || body.length > MAX_BODY) {
    return { ok: false, reason: 'invalid_body' };
  }

  const name = input.name?.trim();
  if (name && name.length > MAX_NAME) {
    return { ok: false, reason: 'invalid_body' };
  }

  let canonicalReplyTo: string | undefined;
  if (input.replyTo) {
    const trimmed = input.replyTo.trim();
    if (trimmed.length > MAX_REPLY_TO) {
      return { ok: false, reason: 'invalid_reply_to' };
    }
    const v = validateEmail(trimmed);
    if (!v.valid) {
      return { ok: false, reason: 'invalid_reply_to' };
    }
    canonicalReplyTo = v.normalized;
  }

  const encryptedBody = await ageEncrypt('messages', body);
  const encryptedName = name ? await ageEncrypt('messages', name) : null;
  const encryptedReplyTo = canonicalReplyTo ? await ageEncrypt('messages', canonicalReplyTo) : null;

  const row = await withConnection(async (client) => {
    const result = await client.queryObject<{ id: string }>(
      `INSERT INTO contact_messages
         (sender_email_hash, recipient_email_hash,
          encrypted_name, encrypted_reply_to, encrypted_body)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        input.senderEmailHash,
        input.recipientEmailHash ?? null,
        encryptedName,
        encryptedReplyTo,
        encryptedBody,
      ],
    );
    return result.rows[0];
  });

  return { ok: true, id: row.id };
}
