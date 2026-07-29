-- 001_initial_schema.sql — TOMBSTONE (retired 2026-07-14)
--
-- This migration formerly created the Express-era schema: users, password_resets,
-- questionnaire_responses, and a connect-pg-simple "session" table. Those tables
-- stored plaintext email in an `email TEXT` column, indexed on LOWER(email).
--
-- That violates the zero-PII policy in CLAUDE.md: no plaintext email is stored on
-- the server. The Express app is retired. The live Fresh app uses the fresh_* tables,
-- which key off email_hash (SHA-256) and never persist an address.
--
-- The CREATE TABLE statements are deliberately NOT preserved. Restoring them would
-- restore the ability to store plaintext email. This file is destructive-forward: it
-- drops the legacy tables if a database still has them, so re-running migrations can
-- never resurrect a plaintext email column.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DROP TABLE IF EXISTS questionnaire_responses CASCADE;
DROP TABLE IF EXISTS password_resets CASCADE;
DROP TABLE IF EXISTS "session" CASCADE;
DROP TABLE IF EXISTS responses CASCADE;
DROP TABLE IF EXISTS user_answers CASCADE;
DROP TABLE IF EXISTS user_ip_history CASCADE;
DROP TABLE IF EXISTS ip_geolocation CASCADE;
DROP TABLE IF EXISTS questionnaire_sessions CASCADE;
DROP TABLE IF EXISTS users CASCADE;
