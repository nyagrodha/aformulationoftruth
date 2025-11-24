/**
 * Database Configuration and Schema
 * PostgreSQL database for encrypted response storage
 */

require('dotenv').config();
const { Pool } = require('pg');

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Test connection
pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
  process.exit(-1);
});

/**
 * Initialize database schema
 */
async function initializeSchema() {
  const client = await pool.connect();

  try {
    console.log('Initializing database schema...');

    // Create responses table
    await client.query(`
      CREATE TABLE IF NOT EXISTS responses (
        id SERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        encrypted_answer TEXT NOT NULL,
        iv TEXT NOT NULL,
        tag TEXT NOT NULL,
        integrity_hash TEXT NOT NULL,
        timestamp BIGINT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(session_id, question_id)
      )
    `);

    // Create sessions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        session_id TEXT NOT NULL UNIQUE,
        completed BOOLEAN DEFAULT FALSE,
        question_order JSONB,
        is_shared BOOLEAN DEFAULT FALSE,
        share_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_responses_session_id
      ON responses(session_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_responses_created_at
      ON responses(created_at)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_session_id
      ON sessions(session_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_share_id
      ON sessions(share_id)
    `);

    console.log('✓ Database schema initialized successfully');

  } catch (error) {
    console.error('Error initializing database schema:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Store encrypted response
 */
async function storeResponse(encryptedResponse) {
  const { sessionId, questionId, encryptedAnswer, iv, tag, timestamp, integrityHash } = encryptedResponse;

  const query = `
    INSERT INTO responses (session_id, question_id, encrypted_answer, iv, tag, integrity_hash, timestamp)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (session_id, question_id)
    DO UPDATE SET
      encrypted_answer = EXCLUDED.encrypted_answer,
      iv = EXCLUDED.iv,
      tag = EXCLUDED.tag,
      integrity_hash = EXCLUDED.integrity_hash,
      timestamp = EXCLUDED.timestamp,
      created_at = CURRENT_TIMESTAMP
    RETURNING id
  `;

  const values = [sessionId, questionId, encryptedAnswer, iv, tag, integrityHash, timestamp];
  const result = await pool.query(query, values);
  return result.rows[0];
}

/**
 * Store session metadata
 */
async function storeSession(sessionData) {
  const { sessionId, completed, questionOrder, isShared, shareId } = sessionData;

  const query = `
    INSERT INTO sessions (session_id, completed, question_order, is_shared, share_id)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (session_id)
    DO UPDATE SET
      completed = EXCLUDED.completed,
      question_order = EXCLUDED.question_order,
      is_shared = EXCLUDED.is_shared,
      share_id = EXCLUDED.share_id,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id
  `;

  const values = [sessionId, completed, JSON.stringify(questionOrder), isShared, shareId];
  const result = await pool.query(query, values);
  return result.rows[0];
}

/**
 * Get all responses for a session
 */
async function getResponses(sessionId) {
  const query = `
    SELECT session_id, question_id, encrypted_answer, iv, tag, integrity_hash, timestamp, created_at
    FROM responses
    WHERE session_id = $1
    ORDER BY created_at ASC
  `;

  const result = await pool.query(query, [sessionId]);
  return result.rows.map(row => ({
    sessionId: row.session_id,
    questionId: row.question_id,
    encryptedAnswer: row.encrypted_answer,
    iv: row.iv,
    tag: row.tag,
    integrityHash: row.integrity_hash,
    timestamp: row.timestamp,
    createdAt: row.created_at
  }));
}

/**
 * Get session metadata
 */
async function getSession(sessionId) {
  const query = `
    SELECT session_id, completed, question_order, is_shared, share_id, created_at, updated_at
    FROM sessions
    WHERE session_id = $1
  `;

  const result = await pool.query(query, [sessionId]);
  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    sessionId: row.session_id,
    completed: row.completed,
    questionOrder: row.question_order,
    isShared: row.is_shared,
    shareId: row.share_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/**
 * Get database statistics
 */
async function getStats() {
  const responsesCount = await pool.query('SELECT COUNT(*) FROM responses');
  const sessionsCount = await pool.query('SELECT COUNT(*) FROM sessions');
  const completedSessionsCount = await pool.query('SELECT COUNT(*) FROM sessions WHERE completed = true');

  return {
    totalResponses: parseInt(responsesCount.rows[0].count),
    totalSessions: parseInt(sessionsCount.rows[0].count),
    completedSessions: parseInt(completedSessionsCount.rows[0].count)
  };
}

module.exports = {
  pool,
  initializeSchema,
  storeResponse,
  storeSession,
  getResponses,
  getSession,
  getStats
};

// If run directly, initialize schema
if (require.main === module) {
  initializeSchema()
    .then(() => {
      console.log('Database initialized successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Failed to initialize database:', error);
      process.exit(1);
    });
}
