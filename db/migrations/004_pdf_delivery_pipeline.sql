-- PDF Delivery Pipeline: Schema additions
-- Supports: age-encrypted email recovery + PDF delivery tracking
--
-- Target DBs:
--   Iceland (a4mula4canti): fresh_gate_responses.encrypted_email
--   Local (a4m_db):         gate_responses.pdf_delivered_at

-- 1. Add encrypted_email to fresh_gate_responses (Iceland)
-- Stores age-armored ciphertext of user's email at submission time.
-- Only the offline pipeline (with age private key) can decrypt this.
-- Nullable because existing rows predate this column.
ALTER TABLE fresh_gate_responses
  ADD COLUMN IF NOT EXISTS encrypted_email TEXT;

-- 2. Add PDF delivery tracking to gate_responses (Local)
-- Marks when a session's PDF was generated and emailed.
-- NULL = not yet delivered. Set by the offline pipeline.
ALTER TABLE gate_responses
  ADD COLUMN IF NOT EXISTS pdf_delivered_at TIMESTAMPTZ;

-- Index for finding undelivered completed sessions efficiently
CREATE INDEX IF NOT EXISTS idx_gate_responses_undelivered
  ON gate_responses (session_id)
  WHERE pdf_delivered_at IS NULL;
