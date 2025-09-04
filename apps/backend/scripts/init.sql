-- scripts/init.sql

PRAGMA foreign_keys = ON;

-- Users table (for magic-link auth)
CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  email        TEXT    UNIQUE NOT NULL,
  created_at   TEXT    NOT NULL
);

-- Questions table (your Proust prompts)
CREATE TABLE IF NOT EXISTS questions (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  text   TEXT    NOT NULL
);

-- Answers table (stores each answer)
CREATE TABLE IF NOT EXISTS answers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  email        TEXT    NOT NULL,
  question_id  INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  answer       TEXT,
  created_at   TEXT    NOT NULL
);

-- (Re)seed a sample question for your tests
DELETE FROM questions;
INSERT INTO questions (text)
VALUES
  ('What is your idea of perfect happiness?');
