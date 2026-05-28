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
  sessionId: string;               // HMAC hash of opaque token
  emailHash: string;
  questionOrder: string;           // Comma-separated indices
  answeredQuestions: number[];
  currentIndex: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface SessionCreationResult {
  opaqueToken: string;            // Send to client (never stored)
  sessionId: string;              // Hash of token (stored in DB)
  emailHash: string;              // For JWT creation
  questionOrder: string;          // For initial state
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
  gateToken?: string
): Promise<SessionCreationResult> {
  // Step 1: Generate opaque token (32 bytes = 256 bits)
  const opaqueToken = generateResumeToken();

  // Step 2: Compute session_id = HMAC-SHA256(opaque_token, secret)
  const sessionId = await hashResumeToken(opaqueToken);

  // Step 3: Generate shuffled question order
  const questionOrder = generateQuestionOrderString();

  await withTransaction(async (client) => {
    // Check for existing incomplete session
    const { rows: existing } = await client.queryObject<{ session_id: string }>(
      `SELECT session_id FROM fresh_questionnaire_sessions
       WHERE email_hash = $1 AND completed_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [emailHash]
    );

    if (existing.length > 0) {
      // Mark old session as completed (new session supersedes it)
      await client.queryObject(
        `UPDATE fresh_questionnaire_sessions
         SET completed_at = NOW()
         WHERE session_id = $1`,
        [existing[0].session_id]
      );
    }

    // Create new session with session_id as primary key
    await client.queryObject(
      `INSERT INTO fresh_questionnaire_sessions
       (session_id, email_hash, question_order, answered_questions, current_index)
       VALUES ($1, $2, $3, $4, $5)`,
      [sessionId, emailHash, questionOrder, [], 0]
    );

    // Link gate responses if provided
    if (gateToken) {
      await client.queryObject(
        `UPDATE fresh_gate_responses
         SET linked_session_id = $1
         WHERE gate_token = $2`,
        [sessionId, gateToken]
      );
    }
  });

  return {
    opaqueToken,
    sessionId,
    emailHash,
    questionOrder,
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
  opaqueToken: string
): Promise<QuestionnaireSession | null> {
  const sessionId = await hashResumeToken(opaqueToken);
  return await getSessionById(sessionId);
}

/**
 * Get session by session_id (hash).
 * Used when client sends session_id directly or from JWT.
 *
 * @param sessionId - HMAC hash of opaque token
 * @returns Session if found and not completed
 */
export async function getSessionById(
  sessionId: string
): Promise<QuestionnaireSession | null> {
  return await withConnection(async (client) => {
    const { rows } = await client.queryObject<any>(
      `SELECT session_id, email_hash, question_order, answered_questions,
              current_index, created_at, updated_at, completed_at
       FROM fresh_questionnaire_sessions
       WHERE session_id = $1 AND completed_at IS NULL`,
      [sessionId]
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
 * Find active session by email hash.
 * Used when user requests new magic link (resume scenario).
 *
 * @param emailHash - SHA-256 hash of email
 * @returns Active session if exists
 */
export async function findActiveSession(
  emailHash: string
): Promise<QuestionnaireSession | null> {
  return await withConnection(async (client) => {
    const { rows } = await client.queryObject<any>(
      `SELECT session_id, email_hash, question_order, answered_questions,
              current_index, created_at, updated_at, completed_at
       FROM fresh_questionnaire_sessions
       WHERE email_hash = $1 AND completed_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [emailHash]
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
export async function updateSessionProgress(
  sessionId: string,
  questionIndex: number,
  newCurrentIndex: number
): Promise<void> {
  await withConnection(async (client) => {
    await client.queryObject(
      `UPDATE fresh_questionnaire_sessions
       SET answered_questions = array_append(answered_questions, $1),
           current_index = $2,
           updated_at = NOW()
       WHERE session_id = $3`,
      [questionIndex, newCurrentIndex, sessionId]
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
  newCurrentIndex: number
): Promise<void> {
  await withConnection(async (client) => {
    await client.queryObject(
      `UPDATE fresh_questionnaire_sessions
       SET current_index = $1,
           updated_at = NOW()
       WHERE session_id = $2`,
      [newCurrentIndex, sessionId]
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
      [sessionId]
    );
  });
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
  answers: Record<string, unknown>
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
      [session.emailHash, JSON.stringify(answers), session.questionOrder, sessionId]
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
  sessionId: string
): Promise<{
  questionIndex: number;
  currentIndex: number;
  totalQuestions: number;
  completed: boolean;
} | null> {
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
      `WITH deleted AS (
         DELETE FROM fresh_questionnaire_sessions
         WHERE created_at < NOW() - INTERVAL '30 days'
         RETURNING 1
       ) SELECT COUNT(*) as count FROM deleted`
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
    const { rows } = await client.queryObject<any>(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE completed_at IS NULL) as active,
         COUNT(*) FILTER (WHERE completed_at IS NOT NULL) as completed,
         AVG(current_index) FILTER (WHERE completed_at IS NULL) as avg_progress
       FROM fresh_questionnaire_sessions
       WHERE created_at > NOW() - INTERVAL '30 days'`
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
