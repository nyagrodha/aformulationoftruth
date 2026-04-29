import { db } from './db.ts';
import { v4 } from 'std/uuid/mod.ts';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const SEGMENT_LENGTH = 4;
const RETRY_LIMIT = 5;

function generateSegment(): string {
  let result = '';
  for (let i = 0; i < SEGMENT_LENGTH; i++) {
    const bytes = crypto.getRandomValues(new Uint8Array(1));
    const byte = bytes[0];
    const maxByteValue = 256 - (256 % ALPHABET.length);

    if (byte < maxByteValue) {
      result += ALPHABET[byte % ALPHABET.length];
    } else {
      i--;
    }
  }
  return result;
}

export async function generatePaymentCode(userId: string): Promise<string> {
  for (let attempt = 0; attempt < RETRY_LIMIT; attempt++) {
    const segment1 = generateSegment();
    const segment2 = generateSegment();
    const code = `A4OT-${segment1}-${segment2}`;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    try {
      const result = await db.queryObject(
        `INSERT INTO payment_codes (code, user_id, expires_at)
         VALUES ($1, $2, $3)
         RETURNING code`,
        [code, userId, expiresAt.toISOString()]
      );

      if (result.rows.length > 0) {
        return code;
      }
    } catch (error) {
      if (error.message?.includes('unique constraint')) {
        continue;
      }
      throw error;
    }
  }

  throw new Error(`Failed to generate unique payment code after ${RETRY_LIMIT} attempts`);
}

export async function validatePaymentCode(code: string): Promise<boolean> {
  const result = await db.queryObject(
    `SELECT id FROM payment_codes
     WHERE code = $1 AND verified = FALSE AND expires_at > NOW()`,
    [code]
  );

  return result.rows.length > 0;
}

export async function activatePaymentCode(
  code: string,
  userId: string
): Promise<{ success: boolean; message: string }> {
  const validation = await validatePaymentCode(code);
  if (!validation) {
    return { success: false, message: 'Invalid or expired payment code' };
  }

  const result = await db.queryObject(
    `UPDATE payment_codes SET verified = TRUE, verified_at = NOW()
     WHERE code = $1 AND user_id = $2
     RETURNING id`,
    [code, userId]
  );

  if (result.rows.length === 0) {
    return { success: false, message: 'Code not found for this user' };
  }

  await db.queryObject(
    `UPDATE users SET profile_tier = 'paid' WHERE id = $1`,
    [userId]
  );

  return { success: true, message: 'Payment activated successfully' };
}

export async function verifyPaymentCodeAsAdmin(
  code: string
): Promise<{ success: boolean; message: string }> {
  const result = await db.queryObject(
    `UPDATE payment_codes SET verified = TRUE, verified_at = NOW()
     WHERE code = $1 AND verified = FALSE
     RETURNING user_id`,
    [code]
  );

  if (result.rows.length === 0) {
    return { success: false, message: 'Code not found or already verified' };
  }

  const userId = result.rows[0].user_id;

  await db.queryObject(
    `UPDATE users SET profile_tier = 'paid' WHERE id = $1`,
    [userId]
  );

  return { success: true, message: `Payment verified for user ${userId}` };
}
