-- Migration: 005_contact_messages.sql
-- Inbound contact-form messages, age-encrypted under the messages_ recipient.
--
-- gupta-vidya compliant: only id + timestamps are stored unencrypted.
-- All user-supplied fields are ASCII-armored age x25519 ciphertext.
-- Only the offline operator (holder of the messages private key) can decrypt.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encrypted_name TEXT,
  encrypted_reply_to TEXT,
  encrypted_body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ
);

-- Find undelivered messages efficiently for the offline pipeline.
CREATE INDEX IF NOT EXISTS idx_contact_messages_undelivered
  ON contact_messages (created_at)
  WHERE delivered_at IS NULL;
