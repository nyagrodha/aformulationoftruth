-- QR scan counting for public QR-bearing objects.
-- Spec: docs/superpowers/specs/2026-08-11-coop-qr-scan-counting-design.md
--
-- Neither table stores an address or a user agent. A visitor is identified
-- only by HMAC(salt_for_today, ip || LF || user_agent), and the salt is
-- deleted after 48 hours -- after which the rows below cannot be recomputed
-- by anyone, so a past day's visitors are permanently un-relinkable.

CREATE TABLE IF NOT EXISTS fresh_qr_salts (
  day  DATE  PRIMARY KEY,
  salt BYTEA NOT NULL                        -- 32 random bytes, minted on the
                                             -- day's first visit, dropped at 48h
);

CREATE TABLE IF NOT EXISTS fresh_qr_scans (
  slug         TEXT        NOT NULL,         -- a column, not a table name, so
                                             -- future QR objects share this
  day          DATE        NOT NULL,         -- the dedup window
  visitor_hash TEXT        NOT NULL,         -- 64 hex chars; opaque once the
                                             -- day's salt is pruned
  bot          BOOLEAN     NOT NULL DEFAULT FALSE,  -- link unfurler, counted
                                                    -- but excluded by default
  first_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hits         INT         NOT NULL DEFAULT 1,      -- re-scans within the day

  -- Distinct visitors is then the row count and raw scans is SUM(hits), so
  -- neither number can be lost to a bug in the other.
  PRIMARY KEY (slug, day, visitor_hash)
);

-- The report reads by slug over a date range; the primary key leads with slug
-- so that is already covered. This index serves the per-day rollup.
CREATE INDEX IF NOT EXISTS fresh_qr_scans_slug_day_idx
  ON fresh_qr_scans (slug, day);
