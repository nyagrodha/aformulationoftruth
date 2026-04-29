/**
 * Payment Code Management
 *
 * Handles generation, validation, and activation of payment codes.
 * Codes are in A4OT-XXXX-XXXX format (36 alphanumeric combinations each segment).
 * gupta-vidya compliance: codes stored with user_id, not personal data.
 */

import { withTransaction } from './db.ts';
import { randomBytes } from 'https://deno.land/std@0.224.0/crypto/mod.ts';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/**
 * Generate random code segment (4 characters from ALPHABET)
 * Uses rejection sampling to avoid modulo bias
 */
function generateSegment(): string {
  let result = '';
  // 252 = 36 * 7, so bytes [0, 252) map uniformly to [0, 36)
  const maxByteValue = Math.floor(256 / ALPHABET.length) * ALPHABET.length;

  while (result.length < 4) {
    const byte = randomBytes(1)[0];
    if (byte < maxByteValue) {
      result += ALPHABET[byte % ALPHABET.length];
    }
  }
  return result;
}

/**
 * Generate unique A4OT-XXXX-XXXX payment code
 * Retries up to 5 times on collision to ensure uniqueness
 */
export async function generatePaymentCode(userId: number): Promise<string> {
  const maxRetries = 5;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const segment1 = generateSegment();
    const segment2 = generateSegment();
    const code = `A4OT-${segment1}-${segment2}`;

    try {
      await withTransaction(async (client) => {
        await client.queryObject(
          `INSERT INTO payment_codes (user_id, code, created_at)
           VALUES ($1, $2, NOW())`,
          [userId, code]
        );
      });
      return code;
    } catch (error) {
      // Check if this is a unique constraint violation
      const isConstraintViolation =
        error instanceof Error &&
        (error.message.includes('unique') ||
          error.message.includes('duplicate'));

      if (!isConstraintViolation || attempt === maxRetries - 1) {
        throw error; // Not a duplicate or out of retries
      }
      // Otherwise, loop will retry with a new code
    }
  }

  throw new Error(
    'Failed to generate unique payment code after maximum retries'
  );
}

/**
 * Validate payment code exists and is not yet verified
 */
export async function validatePaymentCode(code: string): Promise<boolean> {
  const result = await withTransaction(async (client) => {
    const { rows } = await client.queryObject<{ id: number }>(
      `SELECT id FROM payment_codes
       WHERE code = $1 AND verified_at IS NULL`,
      [code]
    );
    return rows.length > 0;
  });

  return result;
}

/**
 * Activate payment code: verify code and upgrade user to paid tier
 */
export async function activatePaymentCode(
  code: string,
  userId: number
): Promise<{ upgraded: boolean; message: string }> {
  return await withTransaction(async (client) => {
    const { rows } = await client.queryObject<{ id: number }>(
      `SELECT id FROM payment_codes
       WHERE code = $1 AND user_id = $2 AND verified_at IS NULL`,
      [code, userId]
    );

    if (rows.length === 0) {
      return { upgraded: false, message: 'Invalid or already-used code' };
    }

    await client.queryObject(
      `UPDATE payment_codes SET verified_at = NOW() WHERE code = $1`,
      [code]
    );

    await client.queryObject(
      `UPDATE users SET profile_tier = 'paid', upgraded_at = NOW()
       WHERE id = $1`,
      [userId]
    );

    return { upgraded: true, message: 'User upgraded to paid tier' };
  });
}

/**
 * Admin: Verify a payment code (mark as verified without user interaction)
 * Used by admins to manually verify out-of-band payments
 * TODO: Add audit_admin_id parameter and audit logging to admin_actions table
 */
export async function verifyPaymentCodeAsAdmin(
  code: string,
  _adminId?: number
): Promise<{
  verified: boolean;
  userId?: number;
  message: string;
}> {
  return await withTransaction(async (client) => {
    const { rows } = await client.queryObject<{ id: number; user_id: number }>(
      `SELECT id, user_id FROM payment_codes
       WHERE code = $1 AND verified_at IS NULL`,
      [code]
    );

    if (rows.length === 0) {
      return { verified: false, message: 'Code not found or already verified' };
    }

    const userId = rows[0].user_id;

    await client.queryObject(
      `UPDATE payment_codes SET verified_at = NOW() WHERE code = $1`,
      [code]
    );

    await client.queryObject(
      `UPDATE users SET profile_tier = 'paid', upgraded_at = NOW()
       WHERE id = $1`,
      [userId]
    );

    // TODO: Insert audit record when audit table exists
    // await client.queryObject(
    //   `INSERT INTO admin_actions (admin_id, action, code, user_id, created_at)
    //    VALUES ($1, 'verify_payment', $2, $3, NOW())`,
    //   [_adminId, code, userId]
    // );

    return {
      verified: true,
      userId,
      message: `Code verified and user ${userId} upgraded`
    };
  });
}
