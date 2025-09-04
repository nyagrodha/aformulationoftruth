CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT,
  display_name  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- external identities (password, google, apple)
CREATE TABLE IF NOT EXISTS user_identities (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL,  -- 'password' | 'google' | 'apple'
  subject       TEXT NOT NULL,  -- e.g. google sub / email / username
  secret_hash   TEXT,           -- for 'password' rows only
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, subject)
);

-- one-time login / magic links
CREATE TABLE IF NOT EXISTS magic_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  email         TEXT,                -- for pre-user flows
  token_hash    TEXT NOT NULL,       -- store hash only
  purpose       TEXT NOT NULL,       -- 'login' | 'verify' | etc
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
