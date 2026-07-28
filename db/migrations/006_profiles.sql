-- 006_profiles.sql
--
-- Optional public/pseudonymous profile, one row per person keyed to the
-- gupta-vidya identity anchor (email_hash — a SHA-256 hash, never an email).
-- Only content a visitor deliberately publishes lives here, so handle /
-- display_name / bio_public are plaintext by design; the encrypted answer
-- store (fresh_responses) is never touched. Per-answer publishing is a
-- follow-up and will land in a separate table, not created here.

CREATE TABLE IF NOT EXISTS fresh_profiles (
    email_hash             VARCHAR(64) PRIMARY KEY,   -- SHA-256 identity anchor, never an email
    handle                 VARCHAR(64) UNIQUE,        -- public pseudonymous address, e.g. /p/<handle>
    display_name           TEXT,                      -- public, published by choice
    bio_public             TEXT,                      -- public, published by choice
    visibility             VARCHAR(16) NOT NULL DEFAULT 'private'
                             CHECK (visibility IN ('private', 'public')),
    accepts_anonymous_mail BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Public profiles are resolved by handle; a partial index keeps the lookup
-- lean and only covers rows that are actually publicly visible.
CREATE INDEX IF NOT EXISTS idx_fresh_profiles_public_handle
  ON fresh_profiles (handle)
  WHERE visibility = 'public';
