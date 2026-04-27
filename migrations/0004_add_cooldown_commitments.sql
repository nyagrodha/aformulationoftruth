-- Cooldown commitments for ZK-compatible questionnaire rate limiting
-- user_hash: HMAC-SHA256 of userId (pseudonymous, unlinkable without server key)
-- encrypted_expiry: AES-256-GCM encrypted cooldown expiry timestamp
-- No PII stored; cooldown period is randomized 66-132 days per completion

CREATE TABLE IF NOT EXISTS cooldown_commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_hash TEXT NOT NULL,
  encrypted_expiry TEXT NOT NULL,
  iv TEXT NOT NULL,
  tag TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cooldown_user_hash ON cooldown_commitments(user_hash);
