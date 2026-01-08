import type { Pool } from 'pg';

export interface PasswordReset {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  used: boolean;
  createdAt: Date;
}

const columns = `
  id,
  user_id AS "userId",
  token_hash AS "tokenHash",
  expires_at AS "expiresAt",
  used,
  created_at AS "createdAt"
`;

export async function createPasswordReset(
  pool: Pool,
  userId: string,
  tokenHash: string,
  expiresAt: Date
): Promise<PasswordReset> {
  const result = await pool.query<PasswordReset>(
    `
      INSERT INTO password_resets (user_id, token_hash, expires_at)
      VALUES ($1, $2, $3)
      RETURNING ${columns}
    `,
    [userId, tokenHash, expiresAt]
  );

  return result.rows[0];
}

export async function findActivePasswordReset(
  pool: Pool,
  tokenHash: string
): Promise<PasswordReset | undefined> {
  const result = await pool.query<PasswordReset>(
    `
      SELECT ${columns}
      FROM password_resets
      WHERE token_hash = $1 AND used = FALSE AND expires_at > NOW()
      LIMIT 1
    `,
    [tokenHash]
  );

  return result.rows[0];
}

export async function markPasswordResetUsed(pool: Pool, id: string): Promise<void> {
  await pool.query(
    `
      UPDATE password_resets
      SET used = TRUE
      WHERE id = $1
    `,
    [id]
  );
}

export async function cleanupExpiredPasswordResets(pool: Pool): Promise<void> {
  await pool.query(`DELETE FROM password_resets WHERE expires_at <= NOW()`);
}
