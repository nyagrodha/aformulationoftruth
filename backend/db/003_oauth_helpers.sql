-- 003_oauth_helpers.sql  (safe to re-run)

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- users: add last_login_at if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users' AND column_name='last_login_at'
  ) THEN
    ALTER TABLE public.users ADD COLUMN last_login_at timestamptz;
  END IF;
END $$;

-- user_identities: add email/email_verified/profile if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='user_identities' AND column_name='email'
  ) THEN
    ALTER TABLE public.user_identities
      ADD COLUMN email citext,
      ADD COLUMN email_verified boolean NOT NULL DEFAULT false,
      ADD COLUMN profile jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- helpful indexes
CREATE INDEX IF NOT EXISTS user_identities_email_idx ON public.user_identities(email);

-- upsert: link or create user by provider/subject, fallback to email
CREATE OR REPLACE FUNCTION public.link_or_create_user(
  p_provider text,
  p_subject  text,
  p_email    citext,
  p_name     text,
  p_email_verified boolean,
  p_profile  jsonb
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- 1) identity already known?
  SELECT ui.user_id INTO v_user_id
  FROM public.user_identities ui
  WHERE ui.provider = p_provider AND ui.subject = p_subject
  LIMIT 1;

  IF v_user_id IS NULL AND p_email IS NOT NULL THEN
    -- 2) fallback: existing user by email?
    SELECT u.id INTO v_user_id
    FROM public.users u
    WHERE u.email = p_email
    LIMIT 1;
  END IF;

  IF v_user_id IS NULL THEN
    -- 3) create user
    INSERT INTO public.users(email, username, display_name)
    VALUES (p_email, p_email, COALESCE(p_name, NULL))
    RETURNING id INTO v_user_id;
  END IF;

  -- 4) ensure identity row exists/updated
  INSERT INTO public.user_identities(user_id, provider, subject, email, email_verified, profile)
  VALUES (v_user_id, p_provider, p_subject, p_email, p_email_verified, COALESCE(p_profile,'{}'::jsonb))
  ON CONFLICT (provider, subject) DO UPDATE
    SET email = EXCLUDED.email,
        email_verified = EXCLUDED.email_verified,
        profile = EXCLUDED.profile;

  RETURN v_user_id;
END $$;

-- convenience: bump last_login_at
CREATE OR REPLACE FUNCTION public.mark_login(p_user_id uuid)
RETURNS void LANGUAGE sql AS $$
  UPDATE public.users SET last_login_at = now() WHERE id = p_user_id;
$$;

-- view: one row per user with last identity seen (arbitrary but useful)
CREATE OR REPLACE VIEW public.v_users_auth AS
SELECT
  u.id,
  u.email,
  u.username,
  u.display_name,
  u.is_active,
  u.created_at,
  u.updated_at,
  u.last_login_at,
  ui.provider,
  ui.subject,
  ui.email_verified
FROM public.users u
LEFT JOIN LATERAL (
  SELECT provider, subject, email_verified
  FROM public.user_identities ui
  WHERE ui.user_id = u.id
  ORDER BY ui.id DESC
  LIMIT 1
) ui ON true;

-- ownership/privs for app role
ALTER FUNCTION public.link_or_create_user(text,text,citext,text,boolean,jsonb) OWNER TO a4m_app;
ALTER FUNCTION public.mark_login(uuid) OWNER TO a4m_app;
ALTER VIEW public.v_users_auth OWNER TO a4m_app;

GRANT SELECT ON public.v_users_auth TO a4m_app;
GRANT EXECUTE ON FUNCTION public.link_or_create_user(text,text,citext,text,boolean,jsonb) TO a4m_app;
GRANT EXECUTE ON FUNCTION public.mark_login(uuid) TO a4m_app;
