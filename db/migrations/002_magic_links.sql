-- Magic link tokens for passwordless authentication
CREATE TABLE IF NOT EXISTS magic_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS magic_links_token_hash_idx ON magic_links (token_hash);
CREATE INDEX IF NOT EXISTS magic_links_email_idx ON magic_links (LOWER(email));
CREATE INDEX IF NOT EXISTS magic_links_expires_at_idx ON magic_links (expires_at);
