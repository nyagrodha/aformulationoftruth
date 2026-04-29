-- Migration: 006_add_user_id_to_sessions.sql
-- Add user_id to questionnaire_sessions table to link sessions to authenticated users
-- This enables proper authentication extraction from JWT/sessions

BEGIN;

-- Add user_id column to questionnaire sessions
ALTER TABLE fresh_questionnaire_sessions
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

-- Create index for faster user lookups
CREATE INDEX IF NOT EXISTS idx_questionnaire_sessions_user_id
  ON fresh_questionnaire_sessions(user_id);

-- Create composite index for finding active sessions by user
CREATE INDEX IF NOT EXISTS idx_questionnaire_sessions_user_active
  ON fresh_questionnaire_sessions(user_id, completed_at)
  WHERE completed_at IS NULL;

COMMIT;

-- Notes:
-- user_id can be NULL for sessions created before users are registered
-- Sessions are linked to users when they authenticate via magic link
-- This allows safe extraction of user_id from JWT instead of request body
