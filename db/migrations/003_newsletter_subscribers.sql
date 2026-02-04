-- Newsletter subscribers with double opt-in
-- gupta-vidya compliant: email hashed for lookup, encrypted for storage

-- Ensure pgcrypto extension is available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Email stored as hash for duplicate checking (can't reverse)
  email_hash TEXT NOT NULL UNIQUE,

  -- Confirmation token (hashed, for security)
  confirmation_token_hash TEXT,
  confirmation_expires_at TIMESTAMPTZ,

  -- Subscription status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'unsubscribed')),

  -- Unsubscribe token (permanent, for one-click unsubscribe)
  unsubscribe_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  unsubscribed_at TIMESTAMPTZ,

  -- Optional: store encrypted email for sending newsletters
  -- (only if you need to actually send to them later)
  encrypted_email TEXT
);

-- Index for confirmation token lookups
CREATE INDEX IF NOT EXISTS newsletter_subscribers_confirmation_token_idx
  ON newsletter_subscribers (confirmation_token_hash)
  WHERE confirmation_token_hash IS NOT NULL;

-- Index for status filtering
CREATE INDEX IF NOT EXISTS newsletter_subscribers_status_idx
  ON newsletter_subscribers (status);

-- Index for unsubscribe token lookups
CREATE INDEX IF NOT EXISTS newsletter_subscribers_unsubscribe_token_idx
  ON newsletter_subscribers (unsubscribe_token);
