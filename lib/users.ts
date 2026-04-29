/**
 * User Profile Management
 *
 * Handles user lookups, tier upgrades, and complete data deletion.
 * gupta-vidya compliance: deletion removes all personal data.
 */

import { withTransaction } from './db.ts';

export interface User {
  id: number;
  email_hash: string;
  profile_tier: 'free' | 'paid';
  encryption_type?: string;
  public_key?: string;
  username?: string;
  bio?: string;
  profile_visibility: 'private' | 'public';
  created_at: Date;
  upgraded_at?: Date;
}

/**
 * Get user by ID
 */
export async function getUserById(userId: number): Promise<User | null> {
  return await withTransaction(async (client) => {
    const { rows } = await client.queryObject<User>(
      `SELECT id, email_hash, profile_tier, encryption_type, public_key,
              username, bio, profile_visibility, created_at, upgraded_at
       FROM users WHERE id = $1`,
      [userId]
    );
    return rows[0] || null;
  });
}

/**
 * Get user by email hash
 */
export async function getUserByEmailHash(
  emailHash: string
): Promise<User | null> {
  return await withTransaction(async (client) => {
    const { rows } = await client.queryObject<User>(
      `SELECT id, email_hash, profile_tier, encryption_type, public_key,
              username, bio, profile_visibility, created_at, upgraded_at
       FROM users WHERE email_hash = $1`,
      [emailHash]
    );
    return rows[0] || null;
  });
}

/**
 * Upgrade user to paid tier
 */
export async function upgradeToPaid(userId: number): Promise<boolean> {
  return await withTransaction(async (client) => {
    const { rows } = await client.queryObject(
      `UPDATE users SET profile_tier = 'paid', upgraded_at = NOW()
       WHERE id = $1
       RETURNING id`,
      [userId]
    );
    return rows.length > 0;
  });
}

/**
 * Update user public key (for X25519 encryption)
 */
export async function setPublicKey(
  userId: number,
  publicKey: string,
  encryptionType: string
): Promise<boolean> {
  return await withTransaction(async (client) => {
    const { rows } = await client.queryObject(
      `UPDATE users
       SET public_key = $1, encryption_type = $2
       WHERE id = $3
       RETURNING id`,
      [publicKey, encryptionType, userId]
    );
    return rows.length > 0;
  });
}

/**
 * Update user profile
 */
export async function updateProfile(
  userId: number,
  updates: {
    username?: string;
    bio?: string;
    profile_visibility?: 'private' | 'public';
  }
): Promise<boolean> {
  const { username, bio, profile_visibility } = updates;

  return await withTransaction(async (client) => {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramCount = 1;

    if (username !== undefined) {
      fields.push(`username = $${paramCount++}`);
      values.push(username);
    }
    if (bio !== undefined) {
      fields.push(`bio = $${paramCount++}`);
      values.push(bio);
    }
    if (profile_visibility !== undefined) {
      fields.push(`profile_visibility = $${paramCount++}`);
      values.push(profile_visibility);
    }

    if (fields.length === 0) return true;

    values.push(userId);
    const query = `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING id`;
    const { rows } = await client.queryObject(query, values);
    return rows.length > 0;
  });
}

/**
 * Complete user data deletion (gupta-vidya compliance)
 * Removes user record and all associated data
 */
export async function deleteUserData(userId: number): Promise<{
  success: boolean;
  message: string;
}> {
  return await withTransaction(async (client) => {
    // Delete responses
    await client.queryObject(
      `DELETE FROM responses WHERE user_id = $1`,
      [userId]
    );

    // Delete payment codes
    await client.queryObject(
      `DELETE FROM payment_codes WHERE user_id = $1`,
      [userId]
    );

    // Delete newsletter subscriptions
    await client.queryObject(
      `DELETE FROM newsletter_emails WHERE user_id = $1`,
      [userId]
    );

    // Delete magic links
    await client.queryObject(
      `DELETE FROM fresh_magic_links WHERE email_hash =
       (SELECT email_hash FROM users WHERE id = $1)`,
      [userId]
    );

    // Delete user and verify deletion
    const { rows } = await client.queryObject<{ id: number }>(
      `DELETE FROM users WHERE id = $1 RETURNING id`,
      [userId]
    );

    if (rows.length === 0) {
      return {
        success: false,
        message: 'User not found'
      };
    }

    return {
      success: true,
      message: 'All user data deleted per privacy policy'
    };
  });
}
