-- Abuse controls for the two endpoints that mail a magic link:
-- /api/gate-submit and /api/auth/magic-link. See lib/gate-guard.ts and
-- docs/superpowers/notes/2026-09-24-gate-abuse.md.

-- Fixed-window counters. `bucket` is never a raw address: IP buckets are
-- HMAC'd before they reach this table (lib/rate-limit.ts), and email buckets
-- are keyed on the SHA-256 email_hash that fresh_questionnaire_sessions
-- already holds. Rows are pruned once their window is two days old.
CREATE TABLE IF NOT EXISTS fresh_rate_limits (
  bucket       TEXT        NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count        INT4        NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);

CREATE INDEX IF NOT EXISTS fresh_rate_limits_window_idx ON fresh_rate_limits (window_start);

-- Spent challenge nonces, so a solved image cannot be replayed. Holds the
-- random nonce and when it was spent; nothing about who spent it.
CREATE TABLE IF NOT EXISTS fresh_captcha_spent (
  nonce    TEXT        PRIMARY KEY,
  spent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fresh_captcha_spent_at_idx ON fresh_captcha_spent (spent_at);

-- Applied by hand as the owner role (see scripts/bootstrap-migrations.ts);
-- the application role is DML-only. Without these the gate fails closed on
-- the first submission with "permission denied":
--   GRANT SELECT, INSERT, UPDATE, DELETE ON fresh_rate_limits TO a4m_app;
--   GRANT SELECT, INSERT, DELETE ON fresh_captcha_spent TO a4m_app;
