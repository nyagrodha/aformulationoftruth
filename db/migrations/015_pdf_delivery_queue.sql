-- Only ciphertext and opaque identifiers. Deleting either owner cancels work.
CREATE TABLE IF NOT EXISTS pdf_delivery_jobs (
    session_id VARCHAR(64) PRIMARY KEY REFERENCES fresh_questionnaire_sessions(session_id) ON DELETE CASCADE,
    gate_token VARCHAR(64) NOT NULL REFERENCES fresh_gate_responses(gate_token) ON DELETE CASCADE,
    delivery_id UUID NOT NULL UNIQUE,
    bundle JSONB,
    state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    lease_until TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);
CREATE INDEX IF NOT EXISTS idx_pdf_delivery_due ON pdf_delivery_jobs(next_attempt_at)
    WHERE state IN ('pending', 'processing');
