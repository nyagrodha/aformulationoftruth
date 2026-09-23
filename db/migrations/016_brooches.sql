-- Brooches and their per-encounter codes.
-- Spec: ~/Projects/ESP32/brooch/docs/superpowers/specs/2026-09-23-encounter-identity-design.md
-- A brooch shows a fresh HMAC-signed code per QR; each scanned code is one
-- encounter. The raw code is never stored -- only its SHA-256.

CREATE TABLE IF NOT EXISTS fresh_brooches (
  id INT4 PRIMARY KEY CHECK (id > 0),               -- brooch_id in the code (u32 on the wire)
  wearable_token VARCHAR NOT NULL REFERENCES fresh_wearables(token),
  issuer_email_hash TEXT NOT NULL,                  -- the admin who issued it
  wearer_email_hash TEXT NOT NULL,                  -- who wears it (also the wearable's owner)
  key_enc TEXT NOT NULL,                            -- K_brooch, AES-256-GCM under BROOCH_KEK
  last_counter BIGINT NOT NULL DEFAULT 0,           -- highest counter accepted as a new encounter
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ                            -- set when lost; all its codes 404
);

CREATE TABLE IF NOT EXISTS fresh_encounter_codes (
  code_hash TEXT PRIMARY KEY,                       -- SHA-256 hex of the code: the encounter ID
  brooch_id INT4 NOT NULL REFERENCES fresh_brooches(id) ON DELETE CASCADE,
  counter BIGINT NOT NULL,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scanner_email_hash TEXT                           -- stamped at gate submit, if they continue
);

CREATE INDEX IF NOT EXISTS fresh_encounter_codes_brooch_idx
  ON fresh_encounter_codes (brooch_id, first_seen);

-- Applied by hand as the owner role (see scripts/bootstrap-migrations.ts);
-- the application role is DML-only and needs these, or /e/ fails closed with
-- "permission denied" on the first scan:
--   GRANT SELECT, INSERT, UPDATE ON fresh_brooches TO a4m_app;
--   GRANT SELECT, INSERT, UPDATE ON fresh_encounter_codes TO a4m_app;
