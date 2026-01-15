/**
 * Authentication Utilities
 *
 * gupta-vidya compliance:
 * - Magic links are capability-limited tokens
 * - Tokens are unlinkable (random, no user correlation in token itself)
 * - Email treated as delivery endpoint, not identity
 * - No durable personal state beyond hashed email
 * - Tokens expire and are single-use
 */

import { randomToken, hashEmail, sha256 } from './crypto.ts';
import { withConnection, withTransaction } from './db.ts';

// Token validity period: 15 minutes
const TOKEN_VALIDITY_MS = 15 * 60 * 1000;

// Session validity period: 24 hours
const SESSION_VALIDITY_MS = 24 * 60 * 60 * 1000;

export interface MagicLinkResult {
  token: string;
  expiresAt: Date;
}

/**
 * Create a magic link token for email authentication.
 *
 * Flow:
 * 1. Hash the email (plaintext immediately discarded)
 * 2. Generate random token
 * 3. Store token hash with email hash
 * 4. Return plaintext token for email delivery
 *
 * The token itself contains no user information.
 */
export async function createMagicLink(email: string): Promise<MagicLinkResult> {
  // Hash email immediately - plaintext only in this scope
  const emailHash = await hashEmail(email);

  // Generate random token (sent to user)
  const token = randomToken(32);

  // Hash the token for storage (we never store plaintext tokens)
  const tokenHash = await sha256(token);

  const expiresAt = new Date(Date.now() + TOKEN_VALIDITY_MS);

  await withConnection(async (client) => {
    // Invalidate any existing tokens for this email hash
    await client.queryObject(
      `UPDATE fresh_magic_links SET used_at = NOW() WHERE email_hash = $1 AND used_at IS NULL`,
      [emailHash]
    );

    // Create new token
    await client.queryObject(
      `INSERT INTO fresh_magic_links (email_hash, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [emailHash, tokenHash, expiresAt]
    );
  });

  return { token, expiresAt };
}

/**
 * Verify and consume a magic link token.
 *
 * Returns the email hash if valid (for session creation).
 * Token is marked as used atomically to prevent replay.
 */
export async function verifyMagicLink(token: string): Promise<string | null> {
  const tokenHash = await sha256(token);

  return await withTransaction(async (client) => {
    // Find and consume token atomically
    const { rows } = await client.queryObject<{
      email_hash: string;
      expires_at: Date;
    }>(
      `UPDATE fresh_magic_links
       SET used_at = NOW()
       WHERE token_hash = $1
         AND used_at IS NULL
         AND expires_at > NOW()
       RETURNING email_hash, expires_at`,
      [tokenHash]
    );

    if (rows.length === 0) {
      return null;
    }

    return rows[0].email_hash;
  });
}

/**
 * Create a session for an authenticated user.
 *
 * Session is identified by a random token, linked to email hash.
 * No PII is stored in the session.
 */
export async function createSession(emailHash: string): Promise<string> {
  const sessionToken = randomToken(32);
  const sessionHash = await sha256(sessionToken);
  const expiresAt = new Date(Date.now() + SESSION_VALIDITY_MS);

  await withConnection(async (client) => {
    await client.queryObject(
      `INSERT INTO fresh_sessions (session_hash, email_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [sessionHash, emailHash, expiresAt]
    );
  });

  return sessionToken;
}

/**
 * Verify a session token.
 *
 * Returns email hash if session is valid.
 */
export async function verifySession(sessionToken: string): Promise<string | null> {
  const sessionHash = await sha256(sessionToken);

  const result = await withConnection(async (client) => {
    const { rows } = await client.queryObject<{ email_hash: string }>(
      `SELECT email_hash FROM fresh_sessions
       WHERE session_hash = $1 AND expires_at > NOW()`,
      [sessionHash]
    );
    return rows[0] ?? null;
  });

  return result?.email_hash ?? null;
}

/**
 * Invalidate a session (logout).
 */
export async function invalidateSession(sessionToken: string): Promise<void> {
  const sessionHash = await sha256(sessionToken);

  await withConnection(async (client) => {
    await client.queryObject(
      `DELETE FROM fresh_sessions WHERE session_hash = $1`,
      [sessionHash]
    );
  });
}

/**
 * Clean up expired tokens and sessions.
 * Run periodically (e.g., hourly).
 */
export async function cleanupExpired(): Promise<{ tokens: number; sessions: number }> {
  return await withConnection(async (client) => {
    const tokensResult = await client.queryObject<{ count: number }>(
      `WITH deleted AS (
         DELETE FROM fresh_magic_links WHERE expires_at < NOW() RETURNING 1
       ) SELECT COUNT(*) as count FROM deleted`
    );

    const sessionsResult = await client.queryObject<{ count: number }>(
      `WITH deleted AS (
         DELETE FROM fresh_sessions WHERE expires_at < NOW() RETURNING 1
       ) SELECT COUNT(*) as count FROM deleted`
    );

    return {
      tokens: Number(tokensResult.rows[0]?.count ?? 0),
      sessions: Number(sessionsResult.rows[0]?.count ?? 0),
    };
  });
}
