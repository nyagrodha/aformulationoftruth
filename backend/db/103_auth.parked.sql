-- 003_auth.sql — auth-ready schema for local + Google/Apple

-- Extensions (no-ops if already present)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- Optional if you want to use pgcrypto for at-rest token encryption later:
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
-- users: add columns for profile + local password logins
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS username        text,
  ADD COLUMN IF NOT EXISTS display_name    text,
  ADD COLUMN IF NOT EXISTS email_verified  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS avatar_url      text,
  ADD COLUMN IF NOT EXISTS last_login_at   timestamptz,
  ADD COLUMN IF NOT EXISTS is_admin        boolean NOT NULL DEFAULT false,
  -- for local password logins (store Argon2id/Bcrypt digest string here)
  ADD COLUMN IF NOT EXISTS password_algo   text,
  ADD COLUMN IF NOT EXISTS password_hash   text;

-- username should be unique if you start using it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_username_unique'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_username_unique UNIQUE (username);
  END IF;
END$$;

-- You already have a unique index on lower(email); keep using it for case-insensitive email
-- (From earlier: CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email)));

-- ─────────────────────────────────────────────────────────────────────────────
-- user_identities: one user → many provider identities (google/apple/password)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_identities (
  id                       uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  provider                 text NOT NULL,       -- 'password' | 'google' | 'apple'
  provider_user_id         text NOT NULL,       -- Google/Apple 'sub' or local pseudo-id

  email                    text,                -- asserted by IdP at the time
  email_verified           boolean,

  -- Store tokens only if you must; if you do, encrypt them in the APP
  -- and place the ciphertext here. (Or use pgcrypto with pgp_sym_encrypt.)
  access_token_encrypted   bytea,
  refresh_token_encrypted  bytea,

  raw_profile              jsonb,               -- copy of IdP profile claims if wanted
  created_at               timestamptz NOT NULL DEFAULT now(),
  last_login_at            timestamptz
);

-- Uniqueness: a subject must be unique within a provider
CREATE UNIQUE INDEX IF NOT EXISTS user_identities_provider_uid_unique
  ON user_identities (provider, provider_user_id);

CREATE INDEX IF NOT EXISTS user_identities_user_id_idx
  ON user_identities (user_id);

-- Optional provider value guard
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='user_identities_provider_chk'
  ) THEN
    ALTER TABLE user_identities
      ADD CONSTRAINT user_identities_provider_chk
      CHECK (provider IN ('password','google','apple'));
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- magic_tokens: small quality-of-life field
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE magic_tokens
  ADD COLUMN IF NOT EXISTS used boolean NOT NULL DEFAULT false;

