-- 008_contact_messages.sql — Contact form: secure messaging
-- Users send a message via /contact.html; server age-encrypts to a dedicated
-- recipient (CONTACT_AGE_RECIPIENT, separate from the gate's age key).
-- Optional client-side PGP wrap is recorded in pgp_inner.
--
-- gupta-vidya compliant: no email, IP, user-agent, request-id or session
-- column. Only the encrypted payload and a creation timestamp.

CREATE TABLE IF NOT EXISTS contact_messages (
  id SERIAL PRIMARY KEY,
  encrypted_payload TEXT NOT NULL,
  pgp_inner BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_messages_created_at
  ON contact_messages (created_at DESC);
