-- 019: Meshtastic <-> Proust bridge.
--
-- PUBLIC-BY-DESIGN DATA. These answers were broadcast in plaintext on the
-- public LongFast channel and are shown on /mesh. They are deliberately NOT
-- joined to gate_encrypted_answers, sessions, or email hashes, and nothing
-- here should ever be. Apply by hand as admin: a4m_app has DML-only grants.
--
-- Spec: ddwaterfall/docs/superpowers/specs/2026-09-25-mesh-proust-bridge-design.md

CREATE TABLE IF NOT EXISTS mesh_questions_sent (
  id             serial PRIMARY KEY,
  question_index smallint NOT NULL CHECK (question_index BETWEEN 2 AND 34),
  packet_id      bigint   NOT NULL,
  sent_at        timestamptz NOT NULL DEFAULT now(),
  -- One question per Chicago evening; a second send that day is refused.
  sent_day       date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Chicago')::date UNIQUE
);

CREATE TABLE IF NOT EXISTS mesh_answers (
  id             serial PRIMARY KEY,
  -- Which evening's question this answers: question_index repeats every ~5 weeks.
  sent_id        integer  NOT NULL REFERENCES mesh_questions_sent(id),
  question_index smallint NOT NULL,
  packet_id      bigint   NOT NULL,
  from_id        text     NOT NULL,
  short_name     text     NOT NULL,
  text           text     NOT NULL CHECK (octet_length(text) <= 240),
  via            text     NOT NULL CHECK (via IN ('reply', 'dm')),
  rx_at          timestamptz NOT NULL,
  -- Set by a DM of "forget". Kept, not deleted, so a replay cannot resurrect it.
  hidden         boolean  NOT NULL DEFAULT false,
  UNIQUE (from_id, packet_id)
);

CREATE INDEX IF NOT EXISTS mesh_answers_sent_idx ON mesh_answers (sent_id) WHERE NOT hidden;

GRANT SELECT, INSERT, UPDATE ON mesh_questions_sent, mesh_answers TO a4m_app;
GRANT USAGE ON SEQUENCE mesh_questions_sent_id_seq, mesh_answers_id_seq TO a4m_app;
