-- Migration: Add gate_responses table for encrypted landing page responses
-- Date: 2025-12-19

CREATE TABLE IF NOT EXISTS gate_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR NOT NULL, -- Anonymous session ID initially
  user_id UUID REFERENCES users(id), -- Linked after login via magic link
  question_text TEXT NOT NULL, -- Store question text for reference
  question_index INTEGER NOT NULL, -- Order in which question was asked (0-3)

  -- AES-256-GCM encryption for all gate responses
  answer TEXT NOT NULL, -- Encrypted ciphertext (base64)
  iv TEXT NOT NULL, -- Initialization vector (base64)
  tag TEXT NOT NULL, -- Authentication tag (base64)
  salt TEXT NOT NULL, -- Per-response salt (base64)

  skipped BOOLEAN NOT NULL DEFAULT FALSE, -- Whether user skipped this question
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  linked_at TIMESTAMP -- When response was linked to user account
);

-- Index for looking up responses by session
CREATE INDEX IF NOT EXISTS idx_gate_responses_session_id ON gate_responses(session_id);

-- Index for looking up responses by user after linking
CREATE INDEX IF NOT EXISTS idx_gate_responses_user_id ON gate_responses(user_id);

-- Index for finding unlinked responses
CREATE INDEX IF NOT EXISTS idx_gate_responses_unlinked ON gate_responses(session_id) WHERE user_id IS NULL;
