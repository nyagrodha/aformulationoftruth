-- Add profile tier to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_tier TEXT NOT NULL DEFAULT 'free' CHECK (profile_tier IN ('free', 'paid'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS public_key TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_visibility TEXT NOT NULL DEFAULT 'private' CHECK (profile_visibility IN ('private', 'public'));

-- Payment codes for paid tier upgrades
CREATE TABLE IF NOT EXISTS payment_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS payment_codes_code_idx ON payment_codes (code);
CREATE INDEX IF NOT EXISTS payment_codes_user_id_idx ON payment_codes (user_id);
CREATE INDEX IF NOT EXISTS payment_codes_verified_idx ON payment_codes (verified);
CREATE INDEX IF NOT EXISTS payment_codes_expires_at_idx ON payment_codes (expires_at);

-- Newsletter unsubscribe tokens
CREATE TABLE IF NOT EXISTS newsletter_unsubscribe_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used BOOLEAN NOT NULL DEFAULT FALSE,
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS newsletter_unsubscribe_tokens_token_idx ON newsletter_unsubscribe_tokens (token);
CREATE INDEX IF NOT EXISTS newsletter_unsubscribe_tokens_email_idx ON newsletter_unsubscribe_tokens (LOWER(email));
