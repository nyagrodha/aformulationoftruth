-- Migration: Add salt column for per-encryption key derivation
-- This enables more secure encryption by using a unique salt per encrypted value
-- instead of a static hardcoded salt.

-- Add salt column to newsletter_emails table
-- Nullable to maintain backward compatibility with existing legacy-encrypted data
ALTER TABLE newsletter_emails
ADD COLUMN IF NOT EXISTS salt TEXT;

-- Comment explaining the field
COMMENT ON COLUMN newsletter_emails.salt IS 'Per-encryption salt for AES-256-GCM key derivation. NULL indicates legacy data using static salt.';
