/**
 * Commissions Service
 *
 * Persists opaque, browser-encrypted commission payloads received via
 * POST /api/commissions. The server never sees plaintext — encryption
 * happens in the sender's browser to the operator's public key.
 *
 * The `algorithm` string is a client-supplied label (e.g.
 * 'rsa-oaep-sha256+aes-256-gcm' for the fobdongle.com/commission.html
 * scheme, or 'age-x25519' for age-armored ciphertext) so the operator's
 * offline decrypt tool knows how to interpret the blob.
 */

import { withConnection } from './db.ts';

export interface StoreCommissionInput {
  algorithm: string;
  ciphertext: string;
}

export interface StoreCommissionResult {
  id: string;
}

export async function storeCommission(
  input: StoreCommissionInput,
): Promise<StoreCommissionResult> {
  const row = await withConnection(async (client) => {
    const result = await client.queryObject<{ id: string }>(
      `INSERT INTO commissions (algorithm, ciphertext)
       VALUES ($1, $2)
       RETURNING id`,
      [input.algorithm, input.ciphertext],
    );
    return result.rows[0];
  });

  return { id: row.id };
}
