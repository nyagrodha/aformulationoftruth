-- Migration: Gupta Vidyā Encryption Support
-- गुप्त-विद्या डेटाबेस योजना
--
-- This migration adds support for encrypted email storage and session management
-- for the Proust Questionnaire with end-to-end encryption

-- Create extension for UUID support if not exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Proust Sessions Table
-- Stores encrypted authentication sessions with associated emails
CREATE TABLE IF NOT EXISTS proust_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_token_hash VARCHAR(64) NOT NULL UNIQUE,
    encrypted_email TEXT NOT NULL,
    email_hash VARCHAR(64) NOT NULL,  -- For lookups without decryption

    -- Encryption metadata
    encryption_algorithm VARCHAR(50) DEFAULT 'aes-256-gcm',
    encryption_version INTEGER DEFAULT 1,

    -- Session management
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,

    -- Security metadata
    ip_address INET,
    user_agent TEXT,

    -- Indexes
    INDEX idx_session_token_hash (session_token_hash),
    INDEX idx_email_hash (email_hash),
    INDEX idx_expires_at (expires_at),
    INDEX idx_created_at (created_at)
);

-- Proust Questionnaire Responses Table
-- Stores the actual questionnaire responses with encrypted email reference
CREATE TABLE IF NOT EXISTS proust_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES proust_sessions(id) ON DELETE CASCADE,

    -- Questionnaire answers stored as JSONB
    answers JSONB NOT NULL,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- For analytics (anonymized)
    response_count INTEGER DEFAULT 0,

    -- Indexes
    INDEX idx_session_id (session_id),
    INDEX idx_created_at (created_at)
);

-- Encryption Audit Log
-- Tracks all encryption/decryption operations for security monitoring
CREATE TABLE IF NOT EXISTS encryption_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    operation VARCHAR(50) NOT NULL,  -- 'encrypt', 'decrypt', 'verify'
    session_id UUID REFERENCES proust_sessions(id) ON DELETE SET NULL,

    -- Operation details
    success BOOLEAN NOT NULL,
    error_message TEXT,

    -- Timing for monitoring śakti freshness
    timestamp_received BIGINT NOT NULL,  -- Unix timestamp from client
    timestamp_processed BIGINT NOT NULL,  -- Unix timestamp server processing
    age_milliseconds INTEGER,  -- Age of encrypted package

    -- Security metadata
    ip_address INET,
    user_agent TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Indexes
    INDEX idx_operation (operation),
    INDEX idx_created_at (created_at),
    INDEX idx_success (success)
);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for auto-updating updated_at in proust_responses
CREATE TRIGGER update_proust_responses_updated_at
    BEFORE UPDATE ON proust_responses
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to cleanup expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM proust_sessions
    WHERE expires_at < CURRENT_TIMESTAMP
    AND used_at IS NULL;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create a scheduled job to cleanup expired sessions (if pg_cron is available)
-- This is optional and requires pg_cron extension
-- SELECT cron.schedule('cleanup-expired-sessions', '0 * * * *', 'SELECT cleanup_expired_sessions()');

-- Grant permissions (adjust based on your database user)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON proust_sessions TO your_app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON proust_responses TO your_app_user;
-- GRANT SELECT, INSERT ON encryption_audit_log TO your_app_user;

-- Insert a comment on tables for documentation
COMMENT ON TABLE proust_sessions IS 'Stores encrypted authentication sessions for Proust Questionnaire with 5-minute śakti freshness window';
COMMENT ON TABLE proust_responses IS 'Stores Proust Questionnaire responses associated with encrypted email sessions';
COMMENT ON TABLE encryption_audit_log IS 'Audit log for all encryption/decryption operations - monitors the gupta-vidyā';

-- Verification query to check table creation
-- SELECT table_name, table_type FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name LIKE 'proust%';
