-- Add salt column to newsletter_emails table for per-encryption salts
-- This supports the new EncryptionService format which includes random salts

ALTER TABLE newsletter_emails
ADD COLUMN IF NOT EXISTS salt TEXT;

-- Add comment explaining the field
COMMENT ON COLUMN newsletter_emails.salt IS 'Base64-encoded salt used for key derivation in AES-256-GCM encryption. NULL for legacy entries using static salt.';
