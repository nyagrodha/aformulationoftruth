-- 002_auth.sql
-- Auth identities (password/google/apple) + magic link tokens

-- Provider identities for users
CREATE TABLE IF NOT EXISTS public.user_identities (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider   text NOT NULL CHECK (provider IN ('password','google','apple')),
  -- For OAuth: the provider subject (e.g. Google "sub" / Apple "sub")
  subject    text NOT NULL,
  -- For 'password' provider: store the password hash (argon2/bcrypt/…)
  secret     text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, subject)
);

-- Magic link tokens (store only a hash of the token)
CREATE TABLE IF NOT EXISTS public.magic_tokens (
  id          bigserial PRIMARY KEY,
  token_hash  bytea NOT NULL,
  email       citext NOT NULL,
  user_id     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  purpose     text NOT NULL DEFAULT 'login',
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Helpful indexes
CREATE UNIQUE INDEX IF NOT EXISTS magic_tokens_token_hash_idx ON public.magic_tokens(token_hash);
CREATE INDEX IF NOT EXISTS magic_tokens_email_idx            ON public.magic_tokens(email);
CREATE INDEX IF NOT EXISTS user_identities_user_id_idx       ON public.user_identities(user_id);

-- Ownership / privileges
ALTER TABLE public.user_identities OWNER TO a4m_app;
ALTER TABLE public.magic_tokens    OWNER TO a4m_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_identities TO a4m_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.magic_tokens    TO a4m_app;
