-- Record whether anyone has proved they can read mail at a session's address.
--
-- The gate now admits a brand-new address straight into the questionnaire
-- without waiting for the emailed link. That is deliberate -- the email round
-- trip is where this site lost most of its respondents -- but it means a
-- session can exist for an address that nobody has shown belongs to them.
-- Anyone can type anyone's address into a form.
--
-- Two consequences need a column each.
--
-- verified_at answers "has the link ever been opened for this session". It
-- gates nothing on its own; the authority for that is the `via` claim on the
-- JWT, which is per-request. This is the durable record, and it is what lets an
-- unverified session be cleaned up later instead of squatting an address
-- forever. Someone who types a stranger's address today occupies it: the real
-- owner arriving tomorrow gets a resend of the squatter's session rather than a
-- questionnaire of their own. Bounded rather than permanent is the difference
-- this column buys.
--
-- link_sent_at answers "when did we last mail a link for this session", and
-- exists to rate-limit resends. Every resend rotates resume_token_hash, because
-- a usable link cannot be reissued without minting a new token -- only the hash
-- is stored. Without a cooldown, anyone could invalidate a stranger's 30-day
-- resume cookie over and over by typing their address at the gate. The person
-- is never locked out (each rotation mails them a working link, and their
-- answers are untouched), but there is no reason to leave the nuisance
-- unbounded.
--
-- Both are nullable and both are absent from every existing row, which reads
-- correctly: no session on record has been verified through this mechanism,
-- because the mechanism did not exist. Backfilling verified_at from the old
-- magic-link data is deliberately NOT done -- fresh_magic_links.used_at was
-- stamped when a NEWER link superseded an older one rather than when anyone
-- clicked, so it records resubmissions, not opens, and treating it as proof of
-- address control would be inventing evidence.
--
-- Neither column holds an address or anything one is recoverable from
-- (/var/www/CLAUDE.md); both are timestamps.

BEGIN;

ALTER TABLE fresh_questionnaire_sessions
  ADD COLUMN IF NOT EXISTS verified_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS link_sent_at TIMESTAMPTZ;

-- Finding the unverified sessions eligible for cleanup is the one query that
-- runs over the whole table on a schedule.
CREATE INDEX IF NOT EXISTS idx_qsessions_unverified
  ON fresh_questionnaire_sessions (created_at)
  WHERE verified_at IS NULL;

COMMENT ON COLUMN fresh_questionnaire_sessions.verified_at IS
  'When the emailed link was first opened for this session, proving someone can read mail at the address. NULL means the address was only typed at the gate and has never been confirmed; such sessions are discarded on a bounded schedule so a mistyped or borrowed address cannot occupy someone else''s indefinitely.';

COMMENT ON COLUMN fresh_questionnaire_sessions.link_sent_at IS
  'When a magic link was last mailed for this session. Used to rate-limit resends, each of which rotates resume_token_hash and so invalidates whatever resume cookie is currently in a browser.';

COMMIT;
