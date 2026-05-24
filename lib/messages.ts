/**
 * Contact Messages Service
 *
 * Stores inbound contact-form submissions age-encrypted under the
 * 'messages' recipient. Only the offline operator with the matching
 * messages_ private key can read these.
 *
 * gupta-vidya compliance:
 * - All user-supplied content is encrypted before insert.
 * - The body is never logged.
 * - If a reply-to email is provided, it is normalized + validated first,
 *   then the canonical form is encrypted (raw input is never persisted).
 */

import { withConnection } from './db.ts';
import { ageEncrypt } from './age-encrypt.ts';
import { validateEmail } from './emailValidator.ts';

export interface StoreMessageInput {
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

export async function storeMessage(
  input: StoreMessageInput,
): Promise<StoreMessageResult> {
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
         (encrypted_name, encrypted_reply_to, encrypted_body)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [encryptedName, encryptedReplyTo, encryptedBody],
    );
    return result.rows[0];
  });

  return { ok: true, id: row.id };
}
