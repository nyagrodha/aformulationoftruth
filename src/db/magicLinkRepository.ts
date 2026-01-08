import type { Pool } from 'pg';

export interface MagicLink {
  id: string;
  email: string;
  tokenHash: string;
  expiresAt: Date;
  used: boolean;
  createdAt: Date;
}

export async function createMagicLink(
  pool: Pool,
  email: string,
  tokenHash: string,
  expiresAt: Date
): Promise<MagicLink> {
  const query = `
    INSERT INTO magic_links (email, token_hash, expires_at)
    VALUES ($1, $2, $3)
    RETURNING id, email, token_hash as "tokenHash", expires_at as "expiresAt", used, created_at as "createdAt"
  `;
  const result = await pool.query(query, [email.toLowerCase(), tokenHash, expiresAt]);
  return result.rows[0];
}

export async function findActiveMagicLink(
  pool: Pool,
  tokenHash: string
): Promise<MagicLink | undefined> {
  const query = `
    SELECT id, email, token_hash as "tokenHash", expires_at as "expiresAt", used, created_at as "createdAt"
    FROM magic_links
    WHERE token_hash = $1
      AND used = FALSE
      AND expires_at > NOW()
  `;
  const result = await pool.query(query, [tokenHash]);
  return result.rows[0];
}

export async function markMagicLinkUsed(pool: Pool, id: string): Promise<void> {
  const query = `UPDATE magic_links SET used = TRUE WHERE id = $1`;
  await pool.query(query, [id]);
}

export async function cleanupExpiredMagicLinks(pool: Pool): Promise<number> {
  const query = `DELETE FROM magic_links WHERE expires_at < NOW() OR used = TRUE`;
  const result = await pool.query(query);
  return result.rowCount ?? 0;
}
