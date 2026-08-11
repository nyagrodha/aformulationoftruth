-- Session keys + PDF delivery
--
-- Supersedes the premise of 004_pdf_delivery_pipeline.sql, which assumed a
-- single global identity could decrypt every address. Here each session has its
-- own keypair; the private half lives only on the Romania box.
--
-- 004 put encrypted_email on fresh_gate_responses (Iceland) but pdf_delivered_at
-- on gate_responses (Local), per its own header. Both belong on the Iceland
-- table, so both are (re)declared here idempotently rather than assumed present.

ALTER TABLE fresh_gate_responses
  ADD COLUMN IF NOT EXISTS session_pubkey TEXT,
  ADD COLUMN IF NOT EXISTS encrypted_email TEXT,
  ADD COLUMN IF NOT EXISTS pdf_delivered_at TIMESTAMPTZ;

COMMENT ON COLUMN fresh_gate_responses.session_pubkey IS
  'age recipient (public). The matching identity lives only on the Romania box.';
COMMENT ON COLUMN fresh_gate_responses.encrypted_email IS
  'Delivery address, age-encrypted to session_pubkey + break-glass. Unreadable here.';
COMMENT ON COLUMN fresh_gate_responses.pdf_delivered_at IS
  'First successful send. Starts the 7-day shred clock on Romania; never updated by re-sends.';

-- Address-locked re-send capabilities. The destination is never stored on the
-- token: it is always resolved from the row's encrypted_email, so a stolen
-- token can only ever mail the same person.
--
-- gate_token is VARCHAR(64) to match fresh_gate_responses.gate_token exactly.
-- The FK would be accepted against TEXT as well, but matching the referenced
-- column keeps the two indexes the same type.
CREATE TABLE IF NOT EXISTS pdf_resend_tokens (
  token       TEXT PRIMARY KEY,
  gate_token  VARCHAR(64) NOT NULL REFERENCES fresh_gate_responses (gate_token) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pdf_resend_tokens_gate
  ON pdf_resend_tokens (gate_token);

-- Supports the atomic claim in the resend endpoint:
--   UPDATE ... WHERE token = $1 AND used_at IS NULL AND expires_at > NOW()
CREATE INDEX IF NOT EXISTS idx_pdf_resend_tokens_live
  ON pdf_resend_tokens (token)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fresh_gate_responses_undelivered
  ON fresh_gate_responses (gate_token)
  WHERE pdf_delivered_at IS NULL;
