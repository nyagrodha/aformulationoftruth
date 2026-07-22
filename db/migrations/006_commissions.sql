-- Migration: 006_commissions.sql
-- First-contact commission requests posted from external sites
-- (currently fobdongle.com/commission.html) via the no-auth /api/commissions
-- endpoint.
--
-- Design: the browser encrypts before transport. The server stores the
-- opaque ciphertext verbatim and never sees plaintext. The operator
-- decrypts offline with whatever private key matches the algorithm the
-- client used.
--
-- gupta-vidya compliant: no sender identity is captured (no auth wall,
-- no account concept for commission senders), no email is collected server-
-- side. If the sender wants to include contact info they put it inside
-- the encrypted body itself.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  algorithm VARCHAR(64) NOT NULL,
  ciphertext TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_commissions_undelivered
  ON commissions (created_at)
  WHERE delivered_at IS NULL;
