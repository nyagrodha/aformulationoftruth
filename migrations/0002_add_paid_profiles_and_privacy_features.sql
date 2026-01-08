-- Migration: Add paid profiles, client-side encryption, and privacy features
-- Created: 2025-11-28

-- Add profile tier and encryption features to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS profile_tier VARCHAR DEFAULT 'free' NOT NULL,
ADD COLUMN IF NOT EXISTS encryption_type VARCHAR DEFAULT 'server' NOT NULL,
ADD COLUMN IF NOT EXISTS public_key TEXT,
ADD COLUMN IF NOT EXISTS username VARCHAR UNIQUE,
ADD COLUMN IF NOT EXISTS bio TEXT,
ADD COLUMN IF NOT EXISTS profile_visibility VARCHAR DEFAULT 'private' NOT NULL;

-- Add unsubscribe token to newsletter emails
ALTER TABLE newsletter_emails
ADD COLUMN IF NOT EXISTS unsubscribe_token TEXT NOT NULL DEFAULT gen_random_uuid()::text UNIQUE;

-- Create payment codes table for manual verification
CREATE TABLE IF NOT EXISTS payment_codes (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  code VARCHAR NOT NULL UNIQUE,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  currency VARCHAR DEFAULT 'USD' NOT NULL,
  payment_method VARCHAR NOT NULL,
  status VARCHAR DEFAULT 'pending' NOT NULL,
  verified_by VARCHAR,
  verified_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Add client-side encryption support to responses
ALTER TABLE responses
ADD COLUMN IF NOT EXISTS encryption_type VARCHAR DEFAULT 'server' NOT NULL,
ADD COLUMN IF NOT EXISTS encrypted_data TEXT,
ADD COLUMN IF NOT EXISTS nonce TEXT,
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1 NOT NULL,
ADD COLUMN IF NOT EXISTS previous_version_id VARCHAR;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_payment_codes_user_id ON payment_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_codes_code ON payment_codes(code);
CREATE INDEX IF NOT EXISTS idx_payment_codes_status ON payment_codes(status);
CREATE INDEX IF NOT EXISTS idx_newsletter_emails_unsubscribe_token ON newsletter_emails(unsubscribe_token);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_profile_tier ON users(profile_tier);

-- Add comments for documentation
COMMENT ON COLUMN users.profile_tier IS 'User tier: free or paid ($3)';
COMMENT ON COLUMN users.encryption_type IS 'Encryption method: server (default) or client (X25519)';
COMMENT ON COLUMN users.public_key IS 'X25519 public key for client-side encryption';
COMMENT ON COLUMN users.username IS 'Optional pseudonym for sharing profiles';
COMMENT ON COLUMN users.profile_visibility IS 'Visibility: private, anonymous, or public';
COMMENT ON COLUMN newsletter_emails.unsubscribe_token IS 'Secure token for one-click unsubscribe';
COMMENT ON COLUMN responses.encryption_type IS 'How this response is encrypted: server or client';
COMMENT ON COLUMN responses.encrypted_data IS 'X25519-encrypted response data for paid users';
COMMENT ON COLUMN responses.version IS 'Version number for response history (paid feature)';
COMMENT ON TABLE payment_codes IS 'Payment verification codes for profile upgrades';
