-- Deno Fresh Migration: Core Schema
-- gupta-vidya compliant: no plaintext PII storage
-- Uses fresh_ prefix to avoid conflicts with legacy tables

-- Magic links for passwordless auth (hash-only)
CREATE TABLE IF NOT EXISTS fresh_magic_links (
    id SERIAL PRIMARY KEY,
    email_hash VARCHAR(64) NOT NULL,          -- SHA-256 hash of email
    token_hash VARCHAR(64) NOT NULL UNIQUE,   -- SHA-256 hash of token
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE          -- NULL if unused
);

CREATE INDEX IF NOT EXISTS idx_fresh_magic_links_token ON fresh_magic_links(token_hash);
CREATE INDEX IF NOT EXISTS idx_fresh_magic_links_email ON fresh_magic_links(email_hash);
CREATE INDEX IF NOT EXISTS idx_fresh_magic_links_expires ON fresh_magic_links(expires_at);

-- Sessions (hash-only)
CREATE TABLE IF NOT EXISTS fresh_sessions (
    id SERIAL PRIMARY KEY,
    session_hash VARCHAR(64) NOT NULL UNIQUE,  -- SHA-256 hash of session token
    email_hash VARCHAR(64) NOT NULL,           -- Links to user (by hash)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fresh_sessions_hash ON fresh_sessions(session_hash);
CREATE INDEX IF NOT EXISTS idx_fresh_sessions_expires ON fresh_sessions(expires_at);

-- Questionnaire responses (hash-only)
CREATE TABLE IF NOT EXISTS fresh_responses (
    id SERIAL PRIMARY KEY,
    email_hash VARCHAR(64) NOT NULL,           -- SHA-256 hash of email
    answers JSONB NOT NULL,                    -- Client-encrypted answers
    question_order VARCHAR(200),               -- Shuffled order used
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fresh_responses_email ON fresh_responses(email_hash);
CREATE INDEX IF NOT EXISTS idx_fresh_responses_created ON fresh_responses(created_at);

-- Newsletter subscriptions (capability-limited)
CREATE TABLE IF NOT EXISTS fresh_newsletter (
    id SERIAL PRIMARY KEY,
    email_hash VARCHAR(64) NOT NULL UNIQUE,    -- SHA-256 hash
    confirmation_token_hash VARCHAR(64),       -- SHA-256 hash of confirmation token
    confirmed_at TIMESTAMP WITH TIME ZONE,     -- NULL until confirmed
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    unsubscribe_token_hash VARCHAR(64) UNIQUE  -- For one-click unsubscribe
);

CREATE INDEX IF NOT EXISTS idx_fresh_newsletter_email ON fresh_newsletter(email_hash);
CREATE INDEX IF NOT EXISTS idx_fresh_newsletter_confirm ON fresh_newsletter(confirmation_token_hash);

-- OTP verifications (Twilio backup)
CREATE TABLE IF NOT EXISTS fresh_otp (
    id SERIAL PRIMARY KEY,
    phone_hash VARCHAR(64) NOT NULL,           -- SHA-256 hash of phone
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    verified_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_fresh_otp_phone ON fresh_otp(phone_hash);
CREATE INDEX IF NOT EXISTS idx_fresh_otp_expires ON fresh_otp(expires_at);

-- Gate responses (for questions 0-1 answered before auth)
CREATE TABLE IF NOT EXISTS fresh_gate_responses (
    id SERIAL PRIMARY KEY,
    gate_token VARCHAR(64) NOT NULL UNIQUE,    -- Random token linking gate to full questionnaire
    q0_answer TEXT,                            -- Answer to question 0
    q1_answer TEXT,                            -- Answer to question 1
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    linked_response_id INTEGER REFERENCES fresh_responses(id)
);

CREATE INDEX IF NOT EXISTS idx_fresh_gate_token ON fresh_gate_responses(gate_token);

-- Comment: All tables store hashes only. No plaintext email, phone, or PII.
-- The system is structurally incapable of surveillance.
