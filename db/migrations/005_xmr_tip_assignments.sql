-- 005_xmr_tip_assignments.sql
--
-- Per-visitor Monero subaddress assignments. One row per opaque cookie:
-- the cookie sticks the visitor to the same subaddress across refreshes
-- (so a page reload does not burn pool addresses), and the wallet-side
-- address_index is recorded for offline reconciliation.

CREATE TABLE IF NOT EXISTS xmr_tip_assignments (
    cookie_id      VARCHAR(64) PRIMARY KEY,
    address        VARCHAR(106) NOT NULL UNIQUE,
    address_index  INTEGER     NOT NULL,
    account_index  INTEGER     NOT NULL DEFAULT 0,
    label          VARCHAR(128) NOT NULL DEFAULT '',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_xmr_tip_assignments_seen
  ON xmr_tip_assignments (last_seen_at);
