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

import { hashEmail, randomToken, sha256 } from './crypto.ts';
import { withConnection, withTransaction } from './db.ts';
import { increment } from './metrics.ts';

// Token validity period: 15 minutes
const TOKEN_VALIDITY_MS = 15 * 60 * 1000;

// Session validity period: 24 hours
const SESSION_VALIDITY_MS = 24 * 60 * 60 * 1000;

export interface MagicLinkResult {
  token: string;
  expiresAt: Date;
  /**
   * Call this function to invalidate the magic link if email sending fails.
   * This prevents orphaned records in the database.
   */
  cleanup: () => Promise<void>;
}

/**
 * Create a magic link token for email authentication.
 *
 * Flow:
 * 1. Hash the email (plaintext immediately discarded)
 * 2. Generate random token
 * 3. Store token hash with email hash
 * 4. Return plaintext token for email delivery + cleanup function
 *
 * The token itself contains no user information.
 *
 * IMPORTANT: If email sending fails after calling this function,
 * you MUST call the returned cleanup() function to prevent orphaned records.
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
    // Retire any outstanding links for this address.
    //
    // DELETE, not `SET used_at = NOW()`. That update is what made used_at
    // useless: it marked a link "used" when a newer one replaced it, so the
    // column counted resubmissions rather than opens. 1,180 of the 2,768 rows
    // on record were stamped that way -- almost exactly the 1,183 repeat
    // sessions -- and the daily report has been publishing that number as
    // "Magic links opened" ever since. Nothing reads these rows besides the
    // report, so removing them loses nothing and leaves used_at free to mean
    // the one thing worth knowing: somebody clicked.
    await client.queryObject(
      `DELETE FROM fresh_magic_links WHERE email_hash = $1 AND used_at IS NULL`,
      [emailHash],
    );

    // Create new token
    await client.queryObject(
      `INSERT INTO fresh_magic_links (email_hash, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [emailHash, tokenHash, expiresAt],
    );
  });

  // Cleanup function to invalidate the magic link if email sending fails
  const cleanup = async (): Promise<void> => {
    try {
      await withConnection(async (client) => {
        // Same reasoning as above: a link that was never sent was never
        // opened, and marking it used would inflate the open count.
        await client.queryObject(
          `DELETE FROM fresh_magic_links WHERE token_hash = $1`,
          [tokenHash],
        );
      });
      console.log('[auth] Cleaned up unused magic link after email failure');
    } catch (cleanupError) {
      // Log but don't throw - cleanup failure shouldn't mask the original error
      console.error('[auth] Failed to cleanup magic link:', cleanupError);
    }
  };

  return { token, expiresAt, cleanup };
}

/**
 * Record that a link issued to this address was opened.
 *
 * This replaces verifyMagicLink(), which was removed on 2026-08-22. That
 * function consumed a token atomically and was, on paper, what enforced the
 * fifteen-minute expiry and the single use the email promises. It had no
 * callers anywhere in the application and never had: /auth/verify authenticates
 * on the JWT in the link, so the fifteen minutes was never enforced, the link
 * was never single-use, and it in fact lasted the JWT's twenty-four hours.
 * Both halves of the sentence in the email were false, and the people who
 * believed them and resubmitted were the ones whose sessions got abandoned.
 *
 * Wiring it up instead was the obvious repair and the wrong one: consuming the
 * token would break returning on a second device, which is a thing people
 * legitimately do with a link that lasts a day.
 *
 * So the row's only remaining job is measurement. Keyed by address rather than
 * by token because /auth/verify never sees the magic token -- the link carries
 * a JWT and a resume token, not this one. Best effort: a failure here must
 * never stop someone getting into their questionnaire.
 *
 * @param emailHash - SHA-256 hash of the address the link was sent to
 */
export async function markMagicLinkOpened(emailHash: string): Promise<void> {
  try {
    await withConnection(async (client) => {
      await client.queryObject(
        `UPDATE fresh_magic_links
            SET used_at = NOW()
          WHERE email_hash = $1 AND used_at IS NULL`,
        [emailHash],
      );
    });
  } catch {
    increment('errors.db.query');
  }
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
 * Clean up expired tokens and sessions.
 * Run periodically (e.g., hourly).
 */
export async function cleanupExpired(): Promise<{ tokens: number; sessions: number }> {
  return await withConnection(async (client) => {
    const tokensResult = await client.queryObject<{ count: number }>(
      `WITH deleted AS (
         DELETE FROM fresh_magic_links WHERE expires_at < NOW() RETURNING 1
       ) SELECT COUNT(*) as count FROM deleted`,
    );

    const sessionsResult = await client.queryObject<{ count: number }>(
      `WITH deleted AS (
         DELETE FROM fresh_sessions WHERE expires_at < NOW() RETURNING 1
       ) SELECT COUNT(*) as count FROM deleted`,
    );

    return {
      tokens: Number(tokensResult.rows[0]?.count ?? 0),
      sessions: Number(sessionsResult.rows[0]?.count ?? 0),
    };
  });
}
