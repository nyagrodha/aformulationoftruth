-- 002_magic_links.sql — TOMBSTONE (retired 2026-07-14)
--
-- This migration formerly created the magic_links table, which stored the recipient
-- address in a plaintext `email TEXT` column and indexed LOWER(email).
--
-- That violates the zero-PII policy in CLAUDE.md. Magic links are now issued by the
-- Fresh app against fresh_magic_links, which stores only email_hash (SHA-256): the
-- address is used for delivery, then hashed, and never persisted.
--
-- The CREATE TABLE statement is deliberately NOT preserved. This file drops the
-- legacy tables if a database still has them.

DROP TABLE IF EXISTS magic_links CASCADE;
DROP TABLE IF EXISTS magic_link_tokens CASCADE;
