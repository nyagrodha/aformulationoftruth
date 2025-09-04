BEGIN;

-- make sure core columns exist / are sane
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS username      TEXT,
  ADD COLUMN IF NOT EXISTS given_name    TEXT,
  ADD COLUMN IF NOT EXISTS family_name   TEXT,
  ADD COLUMN IF NOT EXISTS picture_url   TEXT,
  ADD COLUMN IF NOT EXISTS is_admin      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_login    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ NOT NULL DEFAULT now();

-- auto-bump updated_at
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'users_set_updated_at') THEN
    CREATE TRIGGER users_set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END$$;

-- case-insensitive uniqueness for email/username
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique
  ON users (lower(email)) WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique
  ON users (lower(username)) WHERE username IS NOT NULL;

-- harden identities
ALTER TABLE user_identities
  ALTER COLUMN provider SET NOT NULL,
  ALTER COLUMN subject  SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_identities_provider_chk'
  ) THEN
    ALTER TABLE user_identities
      ADD CONSTRAINT user_identities_provider_chk
      CHECK (provider IN ('password','google','apple'));
  END IF;
END$$;

-- ensure provider+subject unique (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='user_identities_provider_subject_unique'
  ) THEN
    CREATE UNIQUE INDEX user_identities_provider_subject_unique
      ON user_identities (provider, subject);
  END IF;
END$$;

-- require secret_hash when provider='password'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='user_identities_secret_hash_chk'
  ) THEN
    ALTER TABLE user_identities
      ADD CONSTRAINT user_identities_secret_hash_chk
      CHECK ((provider <> 'password') OR (secret_hash IS NOT NULL));
  END IF;
END$$;

-- magic token indexes
CREATE INDEX IF NOT EXISTS idx_magic_tokens_token_hash    ON magic_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_magic_tokens_email         ON magic_tokens (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_magic_tokens_expires_at    ON magic_tokens (expires_at);

-- utility: prune expired/used tokens
CREATE OR REPLACE FUNCTION magic_tokens_prune() RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE n INT;
BEGIN
  DELETE FROM magic_tokens WHERE expires_at < now() OR used_at IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END$$;

COMMIT;
