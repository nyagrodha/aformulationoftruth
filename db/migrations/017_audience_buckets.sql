-- Accurate audience counting (2026-09-23 audit + task 5b).
--
-- Additive only: two new integer columns on fresh_audience_windows. No
-- existing column is dropped, renamed or retyped, so any reader that already
-- SUMs visitors/bot_visitors/requests keeps working unmodified.
--
-- `visitors` DOES change meaning, though its type and name are unchanged: it
-- used to mean "a non-bot (IP, UA) pair reached the middleware, before the
-- response was known" (routes/_middleware.ts, pre-2026-09-23). It now means
-- lib/visit-class.ts's stricter rule -- a real top-level navigation
-- (Sec-Fetch-Mode: navigate, Sec-Fetch-Dest: document), GET, outside /api/,
-- answered 2xx text/html, and not on the extended bot list. That rule counts
-- fewer requests as `visitors` than the old one did (it excludes, among other
-- things, the brooch's status poll and the app's own Deno/ self-fetch -- see
-- the audit's F7/F8), so absolute figures on and after the day this ships are
-- LOWER than the days before it for reasons that are the fix working, not a
-- traffic drop. Do not draw a trend line across the change without noting it.
-- See docs/superpowers/notes/2026-09-23-audience-metric-audit.md.
--
-- unclassified_visitors: distinct pseudonyms this run that passed every check
-- in the rule above except having ANY Sec-Fetch-* header at all (pre-2026
-- browsers, some in-app webviews) and are not a known bot. Counted so the
-- report can show the size of this correction, but deliberately never folded
-- into `visitors`.
--
-- optout_navigations: a PLAIN COUNT, not a distinct-pseudonym set, of
-- Sec-GPC/DNT requests that would otherwise have classified as a visitor. Per
-- the owner's ruling (task-5b-brief.md), an opted-out request never gets a
-- pseudonym computed for it at all -- not even the in-heap, never-persisted
-- kind every other bucket gets -- so this column can only ever be an integer.
-- A bot or unclassified opted-out request is not counted anywhere.

ALTER TABLE fresh_audience_windows
  ADD COLUMN IF NOT EXISTS unclassified_visitors INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS optout_navigations     INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN fresh_audience_windows.visitors IS
  'Distinct pseudonyms seen in this window by this process, under the visit-class.ts rule (rule change 2026-09-23: real top-level navigations only -- see 017_audience_buckets.sql). An UPPER BOUND on people: someone returning in a later window, or after a restart, is counted again. Never an undercount from merging two people.';
COMMENT ON COLUMN fresh_audience_windows.unclassified_visitors IS
  'Distinct pseudonyms this run that passed every visitor check except having any Sec-Fetch-* header, and are not a known bot. A correction line, never folded into visitors.';
COMMENT ON COLUMN fresh_audience_windows.optout_navigations IS
  'Plain count (not distinct pseudonyms) of Sec-GPC/DNT requests that would otherwise have been a visitor. No pseudonym is ever computed for these.';
