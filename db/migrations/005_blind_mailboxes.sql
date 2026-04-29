-- Blind mailboxes: opaque ciphertext storage for age-encrypted messaging
-- Privacy properties:
-- - server stores raw mailbox ids and ciphertext only
-- - no sender, recipient, or plaintext metadata columns
-- - TTL enables automatic deletion to minimize retention

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS mailbox_items (
  pk BIGSERIAL PRIMARY KEY,
  mailbox_id BYTEA NOT NULL,
  ciphertext BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  fetched_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mailbox_lookup
  ON mailbox_items (mailbox_id, created_at);

CREATE INDEX IF NOT EXISTS idx_mailbox_expiry
  ON mailbox_items (expires_at)
  WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mailbox_cleanup
  ON mailbox_items (fetched_at)
  WHERE fetched_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS contact_directory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT,
  age_pub TEXT NOT NULL,
  mailbox_id BYTEA NOT NULL,
  listed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (age_pub)
);

CREATE INDEX IF NOT EXISTS idx_contact_directory_listed_at
  ON contact_directory (listed_at DESC);
