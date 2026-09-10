-- Audience counting: how many, never who.
--
-- This table is the entire durable footprint of visitor counting, and every
-- column in it is an integer, a boolean, a timestamp, or a bounded label. No
-- column can hold a digest, an address, or a user agent, and that is the
-- invariant -- see /var/www/CLAUDE.md, "Schema invariant: no address, and
-- nothing an address is recoverable from".
--
-- The pseudonym that does the counting exists only in the Fresh process's heap:
-- HMAC(salt, "audience-count" || LF || ip || LF || user_agent), where the salt
-- is 32 random bytes rotated on a fixed 4-hour UTC boundary and never written
-- anywhere. This host has no swap, so that salt has no disk representation at
-- all. Deliberately NOT the pattern used by fresh_qr_salts, which keeps its
-- salt in Postgres beside the digests it keys -- anyone with read access there
-- can invert those by enumerating (IPv4, User-Agent) while the salt lives.
--
-- 4 hours because it divides 24 exactly: a window never straddles midnight, so
-- a day's total is well defined and comparable with other days.

CREATE TABLE IF NOT EXISTS fresh_audience_windows (
  window_start TIMESTAMPTZ NOT NULL,          -- UTC, aligned to a 4h boundary
  site         TEXT        NOT NULL,          -- allowlisted label, never a raw Host header
  -- Opaque per-process token. A restart cannot resume a count it has no stored
  -- pseudonyms to rebuild, so it opens a NEW row rather than overwriting one.
  -- The day total is then a plain SUM that over-counts across restarts, which
  -- is the safe direction: this scheme may split one person into several, but
  -- can never merge two people into one.
  run_id       TEXT        NOT NULL,
  visitors     INT         NOT NULL DEFAULT 0,   -- distinct non-bot pseudonyms this run
  bot_visitors INT         NOT NULL DEFAULT 0,   -- flagged, not dropped; an empty UA is not a bot
  requests     INT         NOT NULL DEFAULT 0,   -- rows counted, not distinct
  truncated    BOOLEAN     NOT NULL DEFAULT FALSE, -- the in-memory set hit its cap
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (window_start, site, run_id)
);

CREATE INDEX IF NOT EXISTS fresh_audience_windows_start_idx
  ON fresh_audience_windows (window_start);

COMMENT ON TABLE fresh_audience_windows IS
  'Per-window visitor counts. Integers only -- no digest, address or user agent is ever stored here.';
COMMENT ON COLUMN fresh_audience_windows.visitors IS
  'Distinct pseudonyms seen in this window by this process. An UPPER BOUND on people: someone returning in a later window, or after a restart, is counted again. Never an undercount from merging two people.';
COMMENT ON COLUMN fresh_audience_windows.run_id IS
  'Per-process token. A new process opens a new row rather than resuming a count it cannot rebuild.';
