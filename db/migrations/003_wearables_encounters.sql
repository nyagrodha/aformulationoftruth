-- Wearable encounters: QR-bearing objects that invite the questionnaire.
-- Spec: docs/superpowers/specs/2026-07-25-wearable-encounters-design.md
-- Identity is email_hash throughout, matching fresh_magic_links -- no raw
-- email is ever stored for scanners, and owners are keyed the same way.

CREATE TABLE IF NOT EXISTS fresh_wearables (
  token VARCHAR PRIMARY KEY,                 -- URL-safe random, >= 16 chars
  owner_email_hash TEXT NOT NULL,            -- same identity key as sessions
  display_name TEXT,                         -- NULL = the site's own voice
  share_owner_responses BOOLEAN NOT NULL DEFAULT FALSE,  -- reciprocity election;
                                             -- stays FALSE until the fulfillment
                                             -- view exists (spec constraint)
  label VARCHAR NOT NULL,                    -- e.g. 'garden-aura-proto'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ                     -- NULL until the gifting flow exists
);

CREATE TABLE IF NOT EXISTS fresh_encounters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wearable_token VARCHAR NOT NULL REFERENCES fresh_wearables(token) ON DELETE CASCADE,
  scanner_email_hash TEXT,                   -- pseudonymous; stamped at gate submit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fresh_encounters_wearable_idx
  ON fresh_encounters (wearable_token);
