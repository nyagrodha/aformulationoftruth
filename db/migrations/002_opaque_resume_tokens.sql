-- Migration: 002_opaque_resume_tokens.sql
-- Opaque resume tokens for questionnaire sessions
-- gupta-vidya compliant: no email in URLs, capability-limited tokens
--
-- Flow:
-- 1. Generate opaque_token = random(32 bytes)
-- 2. Compute session_id = HMAC-SHA256(opaque_token, server_secret)
-- 3. Store session_id as primary key (not the token itself)
-- 4. Client stores opaque_token in localStorage
-- 5. Server hashes token to lookup session

BEGIN;

-- Questionnaire sessions table
-- session_id IS the HMAC-SHA256 hash of the opaque token
CREATE TABLE IF NOT EXISTS fresh_questionnaire_sessions (
  session_id VARCHAR(64) PRIMARY KEY,           -- HMAC-SHA256 of opaque token
  email_hash VARCHAR(64) NOT NULL,              -- Links to user (by hash)
  question_order VARCHAR(200) NOT NULL,         -- Shuffled order (e.g., "0,1,2,3,...")
  answered_questions INTEGER[] DEFAULT '{}',    -- Array of answered question indices
  current_index INTEGER DEFAULT 0,              -- Current position in question_order
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,        -- NULL if incomplete
  token_version INTEGER DEFAULT 1               -- For future rotation strategy
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_questionnaire_sessions_email
  ON fresh_questionnaire_sessions(email_hash);

CREATE INDEX IF NOT EXISTS idx_questionnaire_sessions_active
  ON fresh_questionnaire_sessions(email_hash, completed_at)
  WHERE completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_questionnaire_sessions_created
  ON fresh_questionnaire_sessions(created_at);

-- Link responses to sessions
ALTER TABLE fresh_responses
  ADD COLUMN IF NOT EXISTS session_id VARCHAR(64) REFERENCES fresh_questionnaire_sessions(session_id);

CREATE INDEX IF NOT EXISTS idx_fresh_responses_session
  ON fresh_responses(session_id);

-- Link gate responses to sessions
ALTER TABLE fresh_gate_responses
  ADD COLUMN IF NOT EXISTS linked_session_id VARCHAR(64) REFERENCES fresh_questionnaire_sessions(session_id);

CREATE INDEX IF NOT EXISTS idx_fresh_gate_responses_session
  ON fresh_gate_responses(linked_session_id);

-- Add index for faster cleanup queries
CREATE INDEX IF NOT EXISTS idx_questionnaire_sessions_completed
  ON fresh_questionnaire_sessions(completed_at)
  WHERE completed_at IS NOT NULL;

COMMIT;

-- Notes:
-- - session_id is the HMAC hash, not a serial ID
-- - opaque_token is NEVER stored in database
-- - question_order remains in session (not exposed to client until needed)
-- - answered_questions tracks progress server-side
-- - One active session per email_hash (old ones marked completed)
