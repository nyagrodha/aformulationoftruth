import { db } from './db.ts';

export interface User {
  id: number;
  email: string;
  username: string;
  profile_tier: 'free' | 'paid';
  public_key?: string;
  profile_visibility: 'private' | 'public';
  created_at: string;
  updated_at: string;
}

export async function getUserById(userId: number): Promise<User | null> {
  const result = await db.queryObject<User>(
    `SELECT id, email, username, profile_tier, public_key, profile_visibility, created_at, updated_at
     FROM users WHERE id = $1`,
    [userId]
  );

  return result.rows[0] || null;
}

export async function getUserByEmailHash(emailHash: string): Promise<User | null> {
  const result = await db.queryObject<User>(
    `SELECT id, email, username, profile_tier, public_key, profile_visibility, created_at, updated_at
     FROM users WHERE LOWER(email) = LOWER($1)`,
    [emailHash]
  );

  return result.rows[0] || null;
}

export async function upgradeToPaid(userId: number): Promise<boolean> {
  const result = await db.queryObject(
    `UPDATE users SET profile_tier = 'paid' WHERE id = $1 RETURNING id`,
    [userId]
  );

  return result.rows.length > 0;
}

export async function setPublicKey(
  userId: number,
  publicKey: string
): Promise<boolean> {
  const result = await db.queryObject(
    `UPDATE users SET public_key = $1, updated_at = NOW() WHERE id = $2 RETURNING id`,
    [publicKey, userId]
  );

  return result.rows.length > 0;
}

export async function updateProfile(
  userId: number,
  updates: {
    username?: string;
    profile_visibility?: 'private' | 'public';
  }
): Promise<boolean> {
  const setClauses = [];
  const values: unknown[] = [];
  let paramCount = 1;

  if (updates.username !== undefined) {
    setClauses.push(`username = $${paramCount++}`);
    values.push(updates.username);
  }

  if (updates.profile_visibility !== undefined) {
    setClauses.push(`profile_visibility = $${paramCount++}`);
    values.push(updates.profile_visibility);
  }

  if (setClauses.length === 0) {
    return true;
  }

  setClauses.push(`updated_at = NOW()`);
  values.push(userId);

  const result = await db.queryObject(
    `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${paramCount} RETURNING id`,
    values
  );

  return result.rows.length > 0;
}

export async function deleteUserData(userId: number): Promise<boolean> {
  const result = await db.queryObject(
    `DELETE FROM users WHERE id = $1 RETURNING id`,
    [userId]
  );

  return result.rows.length > 0;
}
