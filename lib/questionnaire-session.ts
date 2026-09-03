/**
 * Questionnaire Session Management with Opaque Resume Tokens
 *
 * Session flow:
 * 1. Generate opaque_token = random(32 bytes)
 * 2. Compute session_id = HMAC-SHA256(opaque_token, server_secret)
 * 3. Store session with session_id as primary key
 * 4. Return opaque_token to client (never stored in DB)
 * 5. Client stores opaque_token in localStorage
 * 6. Client sends opaque_token to resume, server hashes to lookup session
 *
 * gupta-vidya compliance:
 * - No email in URLs or client storage
 * - Opaque tokens are capability-limited
 * - Session_id is unlinkable without server secret
 * - One active session per email_hash
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
  sessionId: string; // Hash of token (stored in DB)
  emailHash: string; // For JWT creation
  questionOrder: string; // For initial state
  /** True when a prior incomplete session's work was carried into this one. */
  resuming: boolean;
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

/** A prior incomplete session, read under lock inside the transaction. */
export interface PriorSession {
  sessionId: string;
  questionOrder: string;
  answeredQuestions: number[];
  currentIndex: number;
  /** gate_token of the row currently linked to this session, or null. */
  linkedGateToken: string | null;
}

/** What the transaction should do about a prior session, decided in one place. */
export interface SupersedePlan {
  resuming: boolean;
  /** Session to close, or null for a first-time respondent. */
  supersededSessionId: string | null;
  questionOrder: string;
  answeredQuestions: number[];
  currentIndex: number;
  /** Gate row to point at the new session; null links nothing. */
  gateTokenToLink: string | null;
  /** Session whose gate_encrypted_answers rows must move; null moves none. */
  migrateAnswersFrom: string | null;
}

/**
 * Decide what a second magic link does to the work already done.
 *
 * A fresh link forces a fresh session -- session_id IS the HMAC of the resume
 * token and the token is never stored, so an issued link cannot be re-derived.
 * What is not forced is starting over, which is what used to happen: the old
 * session was closed, its ciphertext stranded under an id nothing reads, and
 * the respondent restarted at question zero in a new order. Their earlier
 * answers then reached the PDF as blanks, indistinguishable from questions
 * they had deliberately skipped.
 *
 * Two things travel together and must not be separated. The answers move to
 * the new session id, and so does the GATE ROW that holds the keypair they are
 * sealed to. Carrying the ciphertext while linking the freshly minted gate row
 * would give the key box an identity that opens the newest answers and none of
 * the older ones -- turning "answers missing" into "answers present and
 * undecryptable", which is harder to notice and worse to debug.
 *
 * `newQuestionOrder` is a thunk so that resuming cannot reshuffle even by
 * accident: reshuffling re-points current_index at a different question, and
 * the next answer would be filed against one the respondent never saw.
 */
export function planSupersede(
  prior: PriorSession | null,
  freshGateToken: string | undefined,
  newQuestionOrder: () => string,
): SupersedePlan {
  if (prior === null) {
    return {
      resuming: false,
      supersededSessionId: null,
      questionOrder: newQuestionOrder(),
      answeredQuestions: [],
      currentIndex: 0,
      gateTokenToLink: freshGateToken ?? null,
      migrateAnswersFrom: null,
    };
  }

  return {
    resuming: true,
    supersededSessionId: prior.sessionId,
    questionOrder: prior.questionOrder,
    // Copied, not aliased: the caller must not be able to mutate the row we read.
    answeredQuestions: [...prior.answeredQuestions],
    currentIndex: prior.currentIndex,
    gateTokenToLink: prior.linkedGateToken ?? freshGateToken ?? null,
    migrateAnswersFrom: prior.sessionId,
  };
}

/**
 * Create a new questionnaire session.
 * Generates opaque token and stores only its HMAC hash.
 *
 * @param emailHash - SHA-256 hash of user's email
 * @param gateToken - Optional gate token to link gate responses
 * @returns Opaque token for client + session details
 */
export async function createQuestionnaireSession(
  emailHash: string,
  gateToken?: string,
): Promise<SessionCreationResult> {
  // Step 1: Generate opaque token (32 bytes = 256 bits)
  const opaqueToken = generateResumeToken();

  // Step 2: Compute session_id = HMAC-SHA256(opaque_token, secret)
  const sessionId = await hashResumeToken(opaqueToken);

  // Steps 3-5 in a single transaction: check gate, create session, link.
  // Assigned inside the transaction callback below, which always runs to
  // completion before the await resolves; TS cannot see through the closure.
  let questionOrder!: string;

  let resuming = false;

  await withTransaction(async (client) => {
    // Serialise concurrent link requests for one person. Two clicks on "send
    // me a link" otherwise race: both read the same prior session, both
    // supersede it, and the second carries forward from a session the first
    // already emptied. FOR UPDATE alone is not enough -- under READ COMMITTED
    // the blocked SELECT re-evaluates `completed_at IS NULL`, finds the row now
    // closed, and proceeds as though this were a first-time respondent.
    await client.queryObject(
      `SELECT pg_advisory_xact_lock(('x' || substr($1, 1, 16))::bit(64)::bigint)`,
      [emailHash],
    );

    // The prior session, read under that lock, together with the gate row that
    // holds the keypair its answers are sealed to.
    const { rows: existing } = await client.queryObject<{
      session_id: string;
      question_order: string;
      answered_questions: number[] | null;
      current_index: number | null;
      linked_gate_token: string | null;
    }>(
      `SELECT s.session_id,
              s.question_order,
              s.answered_questions,
              s.current_index,
              (SELECT g.gate_token
                 FROM fresh_gate_responses g
                WHERE g.linked_session_id = s.session_id
                ORDER BY g.gate_token
                LIMIT 1) AS linked_gate_token
         FROM fresh_questionnaire_sessions s
        WHERE s.email_hash = $1 AND s.completed_at IS NULL
        ORDER BY s.created_at DESC
        LIMIT 1
          FOR UPDATE OF s`,
      [emailHash],
    );

    const prior: PriorSession | null = existing.length > 0
      ? {
        sessionId: existing[0].session_id,
        questionOrder: existing[0].question_order,
        answeredQuestions: existing[0].answered_questions ?? [],
        currentIndex: existing[0].current_index ?? 0,
        linkedGateToken: existing[0].linked_gate_token,
      }
      : null;

    const plan = planSupersede(prior, gateToken, () => {
      // Only consulted for a first-time respondent, so the gate probe that
      // feeds it is only worth running then.
      return generateQuestionOrderString(false);
    });

    if (prior === null && gateToken) {
      const { rows } = await client.queryObject<{ count: string }>(
        `SELECT COUNT(*) as count FROM fresh_gate_responses
         WHERE gate_token = $1`,
        [gateToken],
      );
      if (Number(rows[0]?.count ?? 0) > 0) {
        plan.questionOrder = generateQuestionOrderString(true);
      }
    }

    resuming = plan.resuming;
    questionOrder = plan.questionOrder;

    // Close the old door first. getSessionByToken filters completed_at IS NULL,
    // so this is what stops a still-open tab writing another answer into the id
    // about to be emptied. It narrows that window; it does not close it.
    if (plan.supersededSessionId) {
      await client.queryObject(
        `UPDATE fresh_questionnaire_sessions
         SET completed_at = NOW()
         WHERE session_id = $1`,
        [plan.supersededSessionId],
      );
    }

    // Mint the new session carrying the work already done.
    await client.queryObject(
      `INSERT INTO fresh_questionnaire_sessions
       (session_id, email_hash, question_order, answered_questions, current_index)
       VALUES ($1, $2, $3, $4, $5)`,
      [sessionId, emailHash, plan.questionOrder, plan.answeredQuestions, plan.currentIndex],
    );

    // MOVE the ciphertext -- not a copy. The runtime role holds no DELETE grant
    // on this table (migration 007), so copy-then-delete could not be unwound,
    // and a second copy of a respondent's answers contradicts the shred design.
    // Scoped to the session namespace: questions 0-1 are stored under the gate
    // token, a different namespace, and are deliberately left alone.
    //
    // UNIQUE (session_id, question_index) cannot bite here -- the new id is a
    // fresh HMAC over 32 random bytes, so no row can already carry it. If it
    // ever did, 23505 rolls the whole transaction back and nothing is
    // half-moved, which is the failure we want.
    if (plan.migrateAnswersFrom) {
      await client.queryObject(
        `UPDATE gate_encrypted_answers
         SET session_id = $1
         WHERE session_id = $2`,
        [sessionId, plan.migrateAnswersFrom],
      );
    }

    // Carry the key generation with the answers, so one identity opens the
    // whole bundle.
    let linked = 0;
    if (plan.supersededSessionId) {
      const res = await client.queryObject(
        `UPDATE fresh_gate_responses
         SET linked_session_id = $1
         WHERE linked_session_id = $2`,
        [sessionId, plan.supersededSessionId],
      );
      linked = Number(res.rowCount ?? 0);
    }

    // First-time respondent, or a resuming one whose prior session had no gate
    // row at all (the magic-link-only path).
    if (linked === 0 && plan.gateTokenToLink) {
      await client.queryObject(
        `UPDATE fresh_gate_responses
         SET linked_session_id = $1
         WHERE gate_token = $2`,
        [sessionId, plan.gateTokenToLink],
      );
    }
  });

  return {
    opaqueToken,
    sessionId,
    emailHash,
    questionOrder,
    resuming,
  };
}

/**
 * Get session by opaque token.
 * Client sends opaque token, we hash it to find session.
 *
 * @param opaqueToken - Token stored in client localStorage
 * @returns Session if found and not completed
 */
export async function getSessionByToken(
  opaqueToken: string,
): Promise<QuestionnaireSession | null> {
  const sessionId = await hashResumeToken(opaqueToken);
  return await getSessionById(sessionId);
}

/**
 * Get session by session_id (hash), finished or not.
 *
 * This is the raw row. It is what identity should be read from: whether someone
 * answered their last question has nothing to do with whether they are who the
 * session says, and getSessionById() -- which drops completed rows -- turns a
 * finished respondent into an unauthenticated stranger. That is right for the
 * questionnaire, which has no next question to serve them, and wrong for every
 * other surface. lib/session-auth.ts uses this one and leaves the completed
 * check to callers that actually care.
 *
 * @param sessionId - HMAC hash of opaque token
 * @returns Session if the row exists, regardless of completion
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

    if (rows.length === 0) return null;

    const row = rows[0];
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
  });
}

/**
 * Get session by session_id (hash), only while it is still answerable.
 * Used when client sends session_id directly or from JWT.
 *
 * @param sessionId - HMAC hash of opaque token
 * @returns Session if found and not completed
 */
export async function getSessionById(
  sessionId: string,
): Promise<QuestionnaireSession | null> {
  const session = await getSessionRecord(sessionId);
  return session?.completedAt ? null : session;
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

    if (rows.length === 0) return null;

    const row = rows[0];
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
      `SELECT session_pubkey
         FROM fresh_gate_responses
        WHERE linked_session_id = $1
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

/**
 * Store final answers for completed questionnaire.
 * Links answers to session in fresh_responses table.
 *
 * @param sessionId - Session identifier
 * @param answers - Encrypted answers object
 */
export async function storeSessionAnswers(
  sessionId: string,
  answers: Record<string, unknown>,
): Promise<number> {
  return await withConnection(async (client) => {
    const session = await getSessionById(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const { rows } = await client.queryObject<{ id: number }>(
      `INSERT INTO fresh_responses (email_hash, answers, question_order, session_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [session.emailHash, JSON.stringify(answers), session.questionOrder, sessionId],
    );

    return rows[0].id;
  });
}

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
  return await withConnection(async (client) => {
    const { rows } = await client.queryObject<{ count: number }>(
      // updated_at, NOT created_at. The questionnaire page promises thirty
      // days from a respondent's LAST VISIT, and the key box expires session
      // identities on the same basis (romania/keystore.ts shredExpired).
      // Measuring from creation would delete the session of someone still
      // working on it, making that promise false the moment this is scheduled.
      `WITH deleted AS (
         DELETE FROM fresh_questionnaire_sessions
         WHERE updated_at < NOW() - INTERVAL '30 days'
         RETURNING 1
       ) SELECT COUNT(*) as count FROM deleted`,
    );

    return Number(rows[0]?.count ?? 0);
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
