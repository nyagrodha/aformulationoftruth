/**
 * Questionnaire Session Management with Opaque Resume Tokens
 *
 * Session flow:
 * 1. Generate opaque_token = random(32 bytes)
 * 2. Compute HMAC-SHA256(opaque_token, server_secret)
 * 3. Store that hash in resume_token_hash; on a NEW session it is also the
 *    session_id, which is the primary key and never changes afterwards
 * 4. Return opaque_token to the client (never stored in DB)
 * 5. The client holds it in the `resume_token` cookie -- NOT localStorage;
 *    nothing in this app writes to localStorage, and the privacy page
 *    disclaims the practice
 * 6. Client sends opaque_token to resume, server hashes it to find the session
 *
 * Identity and credential are separate columns, and the distinction is the
 * point. session_id is the identity: answers in gate_encrypted_answers are
 * filed under it, so it must never change or they become unreachable.
 * resume_token_hash is the credential: it rotates whenever the same address
 * submits the gate again, so a returning person can be handed a working link
 * without the row -- and everything already stored under it -- being abandoned.
 *
 * Before migration 012 the two were one column, so reissuing a token meant a
 * new row, which is why 2,737 of 2,767 sessions on record sit at index 0.
 *
 * gupta-vidya compliance:
 * - No email in URLs or client storage
 * - Opaque tokens are capability-limited
 * - Session_id is unlinkable without server secret
 * - One active session per email_hash, reused rather than replaced
 */

import { withConnection, withTransaction } from './db.ts';
import { generateResumeToken, hashResumeToken } from './crypto.ts';
import { generateQuestionOrderString, parseQuestionOrder } from './questionnaire.ts';

export interface QuestionnaireSession {
  sessionId: string; // HMAC hash of opaque token
  emailHash: string;
  questionOrder: string; // Comma-separated indices
  answeredQuestions: number[];
  currentIndex: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface SessionCreationResult {
  opaqueToken: string; // Send to client (never stored)
  sessionId: string; // Stable identity; answers are filed under it
  emailHash: string; // For JWT creation
  questionOrder: string; // For initial state
  /**
   * True when an unfinished session for this address already existed and was
   * resumed rather than created. The caller must treat the two differently:
   * only a session this request CREATED may be logged straight into, because
   * anyone can type someone else's address at the gate.
   */
  reused: boolean;
}

// Database row types for queryObject
interface SessionRow {
  session_id: string;
  email_hash: string;
  question_order: string;
  answered_questions: number[] | null;
  current_index: number | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface StatsRow {
  total: string | bigint;
  active: string | bigint;
  completed: string | bigint;
  avg_progress: number | null;
}

/**
 * Start a questionnaire session for an address, or resume the one it already
 * has, and issue a fresh resume token either way.
 *
 * This REPLACES createQuestionnaireSession, which abandoned any session the
 * address already had by stamping completed_at on it. That was how a magic link
 * already sitting in someone's inbox stopped working -- every read path filters
 * on completed_at -- and how a second submission threw away whatever progress
 * the first had made, since answers are filed under session_id and the
 * replacement row had a different one. 1,183 of 2,767 sessions on record are
 * abandoned that way and 2,737 sit at index 0.
 *
 * Resuming keeps session_id, question_order, current_index, answered_questions
 * and the gate link exactly as they are, and rotates only resume_token_hash so
 * the new link works. The old token stops working, which is unavoidable: the
 * token itself is never stored, only its hash, so a usable link cannot be
 * reissued without minting a new one. That is safe because the link is emailed
 * to the address -- whoever asked for it gains nothing unless they control the
 * mailbox. What the CALLER must not do on a resume is set cookies or rewrite
 * the gate answers; see routes/api/gate-submit.ts.
 *
 * @param emailHash - SHA-256 hash of the address
 * @param gateToken - Optional gate token to link gate responses (new sessions only)
 * @returns Opaque token for the client, plus session details and whether it resumed
 */
export async function startOrResumeSession(
  emailHash: string,
  gateToken?: string,
): Promise<SessionCreationResult> {
  // Opaque token (32 bytes = 256 bits) and its HMAC. For a new session the
  // hash becomes the session_id too, which is the pre-migration-012 invariant
  // and what the backfill assumed.
  const opaqueToken = generateResumeToken();
  const resumeTokenHash = await hashResumeToken(opaqueToken);

  // Assigned inside the transaction callback below, which always runs to
  // completion before the await resolves; TS cannot see through the closure.
  let questionOrder!: string;
  let sessionId!: string;
  let reused = false;

  await withTransaction(async (client) => {
    // Serialize on the address for the life of this transaction.
    //
    // The lookup below takes no lock and, for a first-time address, looks for a
    // row that does not exist yet -- so under READ COMMITTED two submissions
    // arriving together both read zero rows and both INSERT. Neither collides:
    // each uses its own token hash as the primary key. The address ends up with
    // two live sessions, one of which is invisible to findActiveSession, and
    // the "one active session per email_hash" invariant this whole change rests
    // on is quietly false. An advisory lock is enough and needs no schema:
    // hashtext is deterministic, and the lock is released when the transaction
    // ends however it ends.
    await client.queryObject('SELECT pg_advisory_xact_lock(hashtext($1))', [emailHash]);

    // An address has at most one unfinished session. Ordered because "the
    // latest" has to be deterministic; historically several rows could pile up
    // per address and only one of them is the live one.
    const { rows: existing } = await client.queryObject<{ session_id: string; question_order: string }>(
      `SELECT session_id, question_order FROM fresh_questionnaire_sessions
       WHERE email_hash = $1 AND completed_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [emailHash],
    );

    if (existing.length > 0) {
      // Resume. Rotate the credential and nothing else -- in particular NOT
      // question_order, which would reshuffle a questionnaire underneath
      // someone mid-run and orphan the answers already stored against the old
      // positions, and NOT linked_session_id, which still points at the gate
      // row holding this session's keypair.
      reused = true;
      sessionId = existing[0].session_id;
      questionOrder = existing[0].question_order;

      await client.queryObject(
        `UPDATE fresh_questionnaire_sessions
         SET resume_token_hash = $1, updated_at = NOW()
         WHERE session_id = $2`,
        [resumeTokenHash, sessionId],
      );
      return;
    }

    // New session. Whether the gate was answered decides the question order:
    // 33 entries (Q2-34) if it was, 35 shuffled together if it was not.
    let hasGateAnswers = false;
    if (gateToken) {
      const { rows } = await client.queryObject<{ count: string }>(
        `SELECT COUNT(*) as count FROM fresh_gate_responses
         WHERE gate_token = $1`,
        [gateToken],
      );
      hasGateAnswers = Number(rows[0]?.count ?? 0) > 0;
    }

    sessionId = resumeTokenHash;
    questionOrder = generateQuestionOrderString(hasGateAnswers);

    await client.queryObject(
      `INSERT INTO fresh_questionnaire_sessions
       (session_id, email_hash, question_order, answered_questions, current_index, resume_token_hash)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [sessionId, emailHash, questionOrder, [], 0, resumeTokenHash],
    );

    if (gateToken) {
      await client.queryObject(
        `UPDATE fresh_gate_responses
         SET linked_session_id = $1
         WHERE gate_token = $2`,
        [sessionId, gateToken],
      );
    }
  });

  return {
    opaqueToken,
    sessionId,
    emailHash,
    questionOrder,
    reused,
  };
}

/**
 * One place where a row becomes a session, so the three readers cannot drift
 * in how they treat a NULL answered_questions or current_index.
 */
function rowToSession(row: SessionRow): QuestionnaireSession {
  return {
    sessionId: row.session_id,
    emailHash: row.email_hash,
    questionOrder: row.question_order,
    answeredQuestions: row.answered_questions || [],
    currentIndex: row.current_index || 0,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
  };
}

/**
 * How long a resend must wait before it will rotate the token again.
 *
 * Every resend mints a new resume token and so invalidates whatever one is
 * sitting in a browser -- unavoidable, since only the hash is stored. That is
 * fine when the person asking is the person who owns the address, and a
 * nuisance when it is not: anyone can type a stranger's address at the gate.
 * Ten minutes bounds the nuisance without getting in the way of somebody who
 * genuinely did not receive the first one.
 */
export const RESEND_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * Record that the emailed link was opened, proving someone can read mail at
 * this session's address.
 *
 * Idempotent on first-write: verified_at keeps the FIRST proof rather than the
 * most recent, because what matters is whether the address was ever confirmed,
 * not when it was last used.
 */
export async function markSessionVerified(sessionId: string): Promise<void> {
  await withConnection(async (client) => {
    await client.queryObject(
      `UPDATE fresh_questionnaire_sessions
          SET verified_at = COALESCE(verified_at, NOW()), updated_at = NOW()
        WHERE session_id = $1`,
      [sessionId],
    );
  });
}

/** Stamp the moment a link was mailed, for the resend cooldown. */
export async function markLinkSent(sessionId: string): Promise<void> {
  await withConnection(async (client) => {
    await client.queryObject(
      `UPDATE fresh_questionnaire_sessions SET link_sent_at = NOW() WHERE session_id = $1`,
      [sessionId],
    );
  });
}

/**
 * May a link be mailed for this address's session right now?
 *
 * Returns false while the cooldown is running, in which case the caller should
 * tell the person to check their inbox -- the previously sent link is still
 * valid, and sending another would only break it.
 */
export async function mayResend(emailHash: string): Promise<boolean> {
  return await withConnection(async (client) => {
    const { rows } = await client.queryObject<{ recent: boolean }>(
      `SELECT (link_sent_at IS NOT NULL AND link_sent_at > NOW() - ($2::bigint * INTERVAL '1 millisecond'))
                AS recent
         FROM fresh_questionnaire_sessions
        WHERE email_hash = $1 AND completed_at IS NULL
        ORDER BY created_at DESC LIMIT 1`,
      [emailHash, RESEND_COOLDOWN_MS],
    );
    return rows.length === 0 ? true : !rows[0].recent;
  });
}

/**
 * Get a session by its opaque resume token.
 *
 * Looks up resume_token_hash, NOT session_id. Before migration 012 those were
 * the same value so hashing the token and reading the primary key worked; once
 * the token can rotate they diverge, and reading the primary key would find
 * only sessions that had never been resumed.
 *
 * Returns finished sessions too. The resume token is how someone collects a
 * copy of what they wrote after the last question, so refusing a completed
 * session here is what made the consent form on /completion answer
 * "no session" to everyone who actually finished. Callers that need an
 * ANSWERABLE session must check completedAt themselves, or use getSessionById.
 *
 * @param opaqueToken - Token from the client's resume_token cookie
 * @returns Session if the token matches one, finished or not
 */
export async function getSessionByToken(
  opaqueToken: string,
): Promise<QuestionnaireSession | null> {
  const tokenHash = await hashResumeToken(opaqueToken);
  return await withConnection(async (client) => {
    const { rows } = await client.queryObject<SessionRow>(
      `SELECT session_id, email_hash, question_order, answered_questions,
              current_index, created_at, updated_at, completed_at
       FROM fresh_questionnaire_sessions
       WHERE resume_token_hash = $1`,
      [tokenHash],
    );
    return rows.length === 0 ? null : rowToSession(rows[0]);
  });
}

/**
 * Get session by session_id (hash).
 * Used when client sends session_id directly or from JWT.
 *
 * @param sessionId - HMAC hash of opaque token
 * @returns Session if found and not completed
 */
export async function getSessionById(
  sessionId: string,
): Promise<QuestionnaireSession | null> {
  return await withConnection(async (client) => {
    const { rows } = await client.queryObject<SessionRow>(
      `SELECT session_id, email_hash, question_order, answered_questions,
              current_index, created_at, updated_at, completed_at
       FROM fresh_questionnaire_sessions
       WHERE session_id = $1 AND completed_at IS NULL`,
      [sessionId],
    );
    return rows.length === 0 ? null : rowToSession(rows[0]);
  });
}

/**
 * Get a session by session_id whether or not it has finished.
 *
 * The counterpart to getSessionById: that one answers "may this person still
 * answer questions", this one answers "does this session exist". Everything
 * that happens AFTER the last question -- collecting a copy, creating a
 * profile -- needs the second and was wrongly asking the first, which is why
 * finishing the questionnaire disqualified you from the thing finishing it was
 * supposed to earn.
 *
 * @param sessionId - Stable session identity
 * @returns Session if the row exists, finished or not
 */
export async function getSessionRecord(
  sessionId: string,
): Promise<QuestionnaireSession | null> {
  return await withConnection(async (client) => {
    const { rows } = await client.queryObject<SessionRow>(
      `SELECT session_id, email_hash, question_order, answered_questions,
              current_index, created_at, updated_at, completed_at
       FROM fresh_questionnaire_sessions
       WHERE session_id = $1`,
      [sessionId],
    );
    return rows.length === 0 ? null : rowToSession(rows[0]);
  });
}

/**
 * Find active session by email hash.
 * Used when user requests new magic link (resume scenario).
 *
 * @param emailHash - SHA-256 hash of email
 * @returns Active session if exists
 */
export async function findActiveSession(
  emailHash: string,
): Promise<QuestionnaireSession | null> {
  return await withConnection(async (client) => {
    const { rows } = await client.queryObject<SessionRow>(
      `SELECT session_id, email_hash, question_order, answered_questions,
              current_index, created_at, updated_at, completed_at
       FROM fresh_questionnaire_sessions
       WHERE email_hash = $1 AND completed_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [emailHash],
    );

    return rows.length === 0 ? null : rowToSession(rows[0]);
  });
}

/**
 * Update session progress after answering a question.
 * Marks question as answered and advances current index.
 *
 * @param sessionId - Session identifier (HMAC hash)
 * @param questionIndex - Index of question that was answered
 * @param newCurrentIndex - New position in question order
 */
/**
 * The age recipient this session's answers must be encrypted to, or null for a
 * session that predates per-session keys.
 *
 * Deliberately a separate query rather than a column added to the SELECTs in
 * getSessionByToken / getSessionById / findActiveSession. Those three run on
 * every answer submission and every resume; widening them means touching the
 * hot path of a live questionnaire, and a mistake there breaks people mid-run.
 * This is additive -- if the join is wrong it returns null and the caller falls
 * back to the gate default, which is the same behaviour as a legacy session.
 *
 * The gate row is the authority because the keypair is minted in
 * /api/gate-submit, before a session exists; linked_session_id (migration 002)
 * is what ties the two together afterwards.
 */
export async function getSessionPubkey(sessionId: string): Promise<string | null> {
  return await withConnection(async (client) => {
    const result = await client.queryObject<{ session_pubkey: string | null }>(
      // Ordered because a resumed session can end up with more than one gate
      // row pointing at it, and "the key for this session" must not depend on
      // which one Postgres happens to return first. The first is the one whose
      // keypair the answers were encrypted to.
      `SELECT session_pubkey
         FROM fresh_gate_responses
        WHERE linked_session_id = $1
        ORDER BY created_at ASC
        LIMIT 1`,
      [sessionId],
    );
    return result.rows[0]?.session_pubkey ?? null;
  });
}

export async function updateSessionProgress(
  sessionId: string,
  questionIndex: number,
  newCurrentIndex: number,
): Promise<void> {
  await withConnection(async (client) => {
    await client.queryObject(
      `UPDATE fresh_questionnaire_sessions
       SET answered_questions = array_append(answered_questions, $1),
           current_index = $2,
           updated_at = NOW()
       WHERE session_id = $3`,
      [questionIndex, newCurrentIndex, sessionId],
    );
  });
}

/**
 * Update only the current index (for skipped questions).
 * Does not add to answered_questions array.
 *
 * @param sessionId - Session identifier
 * @param newCurrentIndex - New position in question order
 */
export async function updateSessionIndex(
  sessionId: string,
  newCurrentIndex: number,
): Promise<void> {
  await withConnection(async (client) => {
    await client.queryObject(
      `UPDATE fresh_questionnaire_sessions
       SET current_index = $1,
           updated_at = NOW()
       WHERE session_id = $2`,
      [newCurrentIndex, sessionId],
    );
  });
}

/**
 * Mark session as completed.
 * Called when user finishes all questions.
 *
 * @param sessionId - Session identifier
 */
export async function completeSession(sessionId: string): Promise<void> {
  await withConnection(async (client) => {
    await client.queryObject(
      `UPDATE fresh_questionnaire_sessions
       SET completed_at = NOW(), updated_at = NOW()
       WHERE session_id = $1`,
      [sessionId],
    );
  });
}

/**
 * Delete a session (for cleanup on failed operations).
 * Also unlinks any gate responses that were linked to this session.
 *
 * @param sessionId - Session identifier to delete
 */
export async function deleteSession(sessionId: string): Promise<void> {
  try {
    await withTransaction(async (client) => {
      // First, unlink any gate responses
      await client.queryObject(
        `UPDATE fresh_gate_responses
         SET linked_session_id = NULL
         WHERE linked_session_id = $1`,
        [sessionId],
      );

      // Then delete the session
      await client.queryObject(
        `DELETE FROM fresh_questionnaire_sessions
         WHERE session_id = $1`,
        [sessionId],
      );
    });
    console.log('[session] Session deleted');
  } catch {
    // Log but don't throw - cleanup failure shouldn't mask the original error
    console.error('[session] Session deletion failed');
  }
}

// storeSessionAnswers was removed on 2026-08-22. It INSERTed into
// fresh_responses -- the legacy plaintext answers table, which holds 0 rows and
// which nothing has written to since the encrypted path shipped. It had no
// callers, and the only thing keeping it was that it looked like the function
// that stores answers. The one that actually does is recordAnswer in
// lib/answers.ts, which encrypts through the Rust gate.

/**
 * Get next question for session.
 * Returns question index and text based on current position.
 *
 * @param sessionId - Session identifier
 * @returns Next question details or null if completed
 */
export async function getNextQuestion(
  sessionId: string,
): Promise<
  {
    questionIndex: number;
    currentIndex: number;
    totalQuestions: number;
    completed: boolean;
  } | null
> {
  const session = await getSessionById(sessionId);
  if (!session) {
    return null;
  }

  const questionOrder = parseQuestionOrder(session.questionOrder);
  const totalQuestions = questionOrder.length;

  // Check if completed
  if (session.currentIndex >= totalQuestions) {
    return {
      questionIndex: -1,
      currentIndex: session.currentIndex,
      totalQuestions,
      completed: true,
    };
  }

  // Get next question index from shuffled order
  const questionIndex = questionOrder[session.currentIndex];

  return {
    questionIndex,
    currentIndex: session.currentIndex,
    totalQuestions,
    completed: false,
  };
}

/**
 * Clean up expired sessions (older than 30 days).
 * Run periodically via cron job.
 *
 * @returns Number of sessions deleted
 */
export async function cleanupExpiredSessions(): Promise<number> {
  return await withTransaction(async (client) => {
    const { rows } = await client.queryObject<{ session_id: string }>(
      // updated_at, NOT created_at. The questionnaire page promises thirty
      // days from a respondent's LAST VISIT, and the key box expires session
      // identities on the same basis (romania/keystore.ts shredExpired).
      // Measuring from creation would delete the session of someone still
      // working on it, making that promise false the moment this is scheduled.
      `SELECT session_id FROM fresh_questionnaire_sessions
        WHERE updated_at < NOW() - INTERVAL '30 days'`,
    );

    if (rows.length === 0) return 0;

    // Unlink before deleting, for the same reason as cleanupUnverifiedSessions:
    // fresh_gate_responses and fresh_responses both reference this table with
    // NO ACTION, so a session with a gate row -- which is every session created
    // through the gate -- cannot be deleted while the reference stands. This
    // function has had that fault since it was written; it has simply never
    // been scheduled, so the violation was never raised.
    const ids = rows.map((r) => r.session_id);
    await client.queryObject(
      `UPDATE fresh_gate_responses SET linked_session_id = NULL WHERE linked_session_id = ANY($1::text[])`,
      [ids],
    );
    await client.queryObject(
      `DELETE FROM fresh_responses WHERE session_id = ANY($1::text[])`,
      [ids],
    );
    await client.queryObject(
      `DELETE FROM fresh_questionnaire_sessions WHERE session_id = ANY($1::text[])`,
      [ids],
    );

    return ids.length;
  });
}

/**
 * How long an unverified session may hold an address.
 *
 * A session whose link has never been opened rests on nothing but a typed
 * address, and until it is cleared it OCCUPIES that address: the real owner
 * arriving at the gate is handed a resend of the stranger's session rather than
 * a questionnaire of their own. Seven days is long enough that someone who
 * started on a phone, ignored the email, and came back the following weekend
 * still finds their answers, and short enough that a mistyped or borrowed
 * address frees itself.
 */
const UNVERIFIED_SESSION_TTL_DAYS = 7;

/**
 * Discard sessions whose address was never confirmed and which nobody has
 * touched for a week.
 *
 * Deliberately keyed on updated_at rather than created_at, for the same reason
 * as cleanupExpiredSessions: someone answering questions is plainly still using
 * the session, whether or not they ever opened the email.
 *
 * @returns How many were discarded
 */
export async function cleanupUnverifiedSessions(): Promise<number> {
  return await withTransaction(async (client) => {
    // Unlink first, or the DELETE cannot run at all.
    //
    // fresh_gate_responses.linked_session_id and fresh_responses.session_id both
    // reference this table with NO ACTION, so deleting a session that any gate
    // row points at raises a foreign-key violation -- and every session created
    // through the gate has exactly such a row. Setting the reference to NULL
    // keeps the gate row, which is deliberate: it holds session_pubkey and
    // encrypted_email, and the ciphertext it corresponds to lives in the Rust
    // gate keyed by gate_token, not by session id. Removing the session
    // withdraws the claim on the address without destroying anything encrypted.
    const doomed = await client.queryObject<{ session_id: string }>(
      `SELECT session_id FROM fresh_questionnaire_sessions
        WHERE verified_at IS NULL
          AND updated_at < NOW() - ($1::int * INTERVAL '1 day')`,
      [UNVERIFIED_SESSION_TTL_DAYS],
    );
    if (doomed.rows.length === 0) return 0;

    const ids = doomed.rows.map((r) => r.session_id);
    await client.queryObject(
      `UPDATE fresh_gate_responses SET linked_session_id = NULL WHERE linked_session_id = ANY($1::text[])`,
      [ids],
    );
    await client.queryObject(
      `DELETE FROM fresh_responses WHERE session_id = ANY($1::text[])`,
      [ids],
    );
    await client.queryObject(
      `DELETE FROM fresh_questionnaire_sessions WHERE session_id = ANY($1::text[])`,
      [ids],
    );

    return ids.length;
  });
}

/**
 * Get session statistics (for monitoring).
 */
export async function getSessionStats(): Promise<{
  total: number;
  active: number;
  completed: number;
  averageProgress: number;
}> {
  return await withConnection(async (client) => {
    const { rows } = await client.queryObject<StatsRow>(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE completed_at IS NULL) as active,
         COUNT(*) FILTER (WHERE completed_at IS NOT NULL) as completed,
         AVG(current_index) FILTER (WHERE completed_at IS NULL) as avg_progress
       FROM fresh_questionnaire_sessions
       WHERE created_at > NOW() - INTERVAL '30 days'`,
    );

    const row = rows[0];
    return {
      total: Number(row.total || 0),
      active: Number(row.active || 0),
      completed: Number(row.completed || 0),
      averageProgress: Number(row.avg_progress || 0),
    };
  });
}
