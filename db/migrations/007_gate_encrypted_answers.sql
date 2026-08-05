-- 007_gate_encrypted_answers.sql
--
-- Storage for the gate service (rust-server/), which age-encrypts every gate
-- answer to an offline x25519 recipient before insert. Nothing here is
-- readable without that identity: `ciphertext` holds ASCII-armored age output,
-- never plaintext, and there is deliberately no column that could hold one.
--
-- The gate previously wrote to its own SQLite file, so this table did not
-- exist. Consolidating onto the app's Postgres costs no privacy: the rows are
-- already unreadable armor before they reach any database, so encryption —
-- not the storage boundary — is what protects them. It does mean one database
-- to back up, migrate and monitor instead of two.
--
-- This file owns the schema; the service performs no DDL. It runs as a role
-- holding DML only, so a CREATE TABLE from the service fails with "permission
-- denied for schema public" even when correctly configured. It preflights for
-- this table instead and refuses to start if it is absent.
--
-- Apply as a privileged role, then grant the runtime role its DML rights:
--
--   GRANT SELECT, INSERT, UPDATE ON gate_encrypted_answers TO a4m_app;
--   GRANT USAGE, SELECT ON SEQUENCE gate_encrypted_answers_id_seq TO a4m_app;

CREATE TABLE IF NOT EXISTS gate_encrypted_answers (
    id             BIGSERIAL   PRIMARY KEY,
    session_id     TEXT        NOT NULL,              -- opaque per-visit id, not an identity
    question_index BIGINT      NOT NULL,              -- 0..64, validated service-side
    question_text  TEXT        NOT NULL,              -- the prompt shown, not the response
    ciphertext     TEXT        NOT NULL,              -- ASCII-armored age output, never plaintext
    skipped        BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One row per (session, question). Re-answering updates in place rather
    -- than accumulating history, so a visitor changing their mind does not
    -- leave the superseded answer behind.
    UNIQUE (session_id, question_index)
);

CREATE INDEX IF NOT EXISTS idx_gate_session
    ON gate_encrypted_answers (session_id);
