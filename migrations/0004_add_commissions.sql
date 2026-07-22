-- Migration: Add commissions table
-- First-contact commission requests submitted to POST /api/commissions
-- (typically from external sites like fobdongle.com/commission.html).
--
-- Design:
--   * The sender's browser encrypts client-side; the server stores
--     `ciphertext` verbatim and never sees plaintext.
--   * `algorithm` is a client-supplied label (e.g.
--     'rsa-oaep-sha256+aes-256-gcm', 'age-x25519') so the operator's
--     offline decrypt tool knows how to interpret the blob.
--   * No sender identity is captured server-side. If the sender wants to
--     include contact info, they put it inside the encrypted body.

CREATE TABLE IF NOT EXISTS commissions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  algorithm VARCHAR(64) NOT NULL,
  ciphertext TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  delivered_at TIMESTAMP
);

-- Speeds up the offline pipeline's "give me everything undelivered" query.
CREATE INDEX IF NOT EXISTS idx_commissions_undelivered
  ON commissions (created_at)
  WHERE delivered_at IS NULL;

COMMENT ON COLUMN commissions.algorithm IS 'Client-supplied crypto label for the ciphertext (e.g. rsa-oaep-sha256+aes-256-gcm, age-x25519). Operator uses this to select the right decrypt tool.';
COMMENT ON COLUMN commissions.ciphertext IS 'Opaque browser-encrypted payload. Stored verbatim; server never decrypts.';
