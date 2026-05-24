-- Migration: 005_contact_messages.sql
-- Inbound messages from signed-in users, age-encrypted under the messages_ recipient.
--
-- gupta-vidya compliant:
-- - encrypted_* columns hold ASCII-armored age x25519 ciphertext.
-- - sender_email_hash / recipient_email_hash are already SHA-256 hashes (the
--   same identity used elsewhere in fresh_*); keeping them in plaintext makes
--   the operator's offline triage tractable without weakening privacy.
-- - recipient_email_hash NULL means "to the operator" (the only addressable
--   recipient until per-user keypairs ship). The column is here now so the
--   user-to-user feature is a schema-compatible addition, not a rewrite.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_email_hash VARCHAR(64) NOT NULL,
  recipient_email_hash VARCHAR(64),
  encrypted_name TEXT,
  encrypted_reply_to TEXT,
  encrypted_body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_contact_messages_sender
  ON contact_messages (sender_email_hash);

CREATE INDEX IF NOT EXISTS idx_contact_messages_recipient
  ON contact_messages (recipient_email_hash)
  WHERE recipient_email_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contact_messages_undelivered
  ON contact_messages (created_at)
  WHERE delivered_at IS NULL;
