-- Let a session outlive a second gate submission.
--
-- Until now, submitting the gate again with the same address ABANDONED whatever
-- session was already open: createQuestionnaireSession stamped completed_at on
-- the older row so that only one could be active per address. Two things
-- followed, and both were invisible.
--
-- The first is that the magic link already sitting in someone's inbox stopped
-- working, because every read path filters `completed_at IS NULL` -- so the
-- earlier link resolved to nothing and rendered the verification error page.
-- 1,183 of the 2,767 sessions on record are in that state, and 492 different
-- addresses submitted more than once. The email told them the link "expires in
-- 15 minutes and can only be used once", which was false in both halves, so the
-- people most likely to resubmit were the ones acting on the instructions.
--
-- The second is that the answers do not follow. Ciphertext in
-- gate_encrypted_answers is filed under the session id, so a replacement
-- session starts empty no matter how far the previous one got. That is the
-- shape the database is in: 2,737 of 2,767 sessions sit at current_index 0.
--
-- The fix is to keep the row and rotate the credential instead. That is not
-- possible as the schema stands, because the credential IS the identity:
-- session_id is HMAC(resume_token) and the token itself is never stored
-- (lib/questionnaire-session.ts). Handing someone a new token therefore meant
-- computing a new session_id and thus a new row. This column separates the two,
-- so the token can be reissued while session_id -- and every answer filed under
-- it -- stays put.
--
-- The backfill is what makes this safe to apply before the code that uses it:
-- today session_id already IS the hash of the outstanding token, so seeding
-- resume_token_hash from it leaves all 2,768 links in the wild resolving
-- exactly as they do now. Old code ignores the column; new code finds it
-- already correct. Migrate first, deploy second -- never the other way round.
--
-- No new exposure. resume_token_hash holds the same class of value as
-- session_id: an HMAC of 32 random bytes, carrying nothing about the person and
-- nothing an address is recoverable from (/var/www/CLAUDE.md).

BEGIN;

ALTER TABLE fresh_questionnaire_sessions
  ADD COLUMN IF NOT EXISTS resume_token_hash VARCHAR(64);

UPDATE fresh_questionnaire_sessions
   SET resume_token_hash = session_id
 WHERE resume_token_hash IS NULL;

-- Unique because it is a credential: two rows answering to one token would let
-- a lookup return either. Not the primary key, which is the whole point --
-- session_id stays stable while this rotates.
CREATE UNIQUE INDEX IF NOT EXISTS idx_qsessions_resume_token_hash
  ON fresh_questionnaire_sessions (resume_token_hash);

COMMENT ON COLUMN fresh_questionnaire_sessions.resume_token_hash IS
  'HMAC-SHA256 of the opaque resume token currently valid for this session. Rotates when the address submits the gate again; session_id does not, so answers already stored stay reachable. Backfilled equal to session_id, which is what it was implicitly before this column existed.';

COMMIT;
