/**
 * Session Utilities
 *
 * gupta-vidya compliance:
 * - Email treated as delivery endpoint, not identity
 * - No durable personal state beyond hashed email
 * - Sessions expire; tokens are random and carry no user correlation
 *
 * Magic-link authentication does NOT live here. The link a respondent
 * receives carries a signed JWT (lib/jwt.ts) and an opaque resume token whose
 * HMAC is the session id (lib/questionnaire-session.ts); /auth/verify checks
 * those two against each other and the session row. A `fresh_magic_links`
 * table and a createMagicLink()/verifyMagicLink() pair used to exist beside
 * that design, minted on every request and consulted by nothing: the token
 * never went into the link and the verifier had no callers. It was a
 * write-only log of when each hashed address asked for a link -- exactly the
 * metadata the rest of the codebase avoids keeping -- and was removed, table
 * and all (migration 015).
 */

import { randomToken, sha256 } from './crypto.ts';
import { withConnection } from './db.ts';

// Session validity period: 24 hours
const SESSION_VALIDITY_MS = 24 * 60 * 60 * 1000;

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
      [sessionHash, emailHash, expiresAt],
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
      [sessionHash],
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
      [sessionHash],
    );
  });
}

/**
 * Clean up expired sessions.
 * Run periodically (e.g., hourly).
 */
export async function cleanupExpired(): Promise<{ sessions: number }> {
  return await withConnection(async (client) => {
    const sessionsResult = await client.queryObject<{ count: number }>(
      `WITH deleted AS (
         DELETE FROM fresh_sessions WHERE expires_at < NOW() RETURNING 1
       ) SELECT COUNT(*) as count FROM deleted`,
    );

    return {
      sessions: Number(sessionsResult.rows[0]?.count ?? 0),
    };
  });
}
