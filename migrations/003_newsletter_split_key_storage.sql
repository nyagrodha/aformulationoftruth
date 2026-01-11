-- Migration: Split-key storage for newsletter emails
-- Store salts remotely, encrypted data locally

-- Add remote_salt_id to track salt storage location
ALTER TABLE newsletter_emails
ADD COLUMN IF NOT EXISTS remote_salt_id VARCHAR(64),
ADD COLUMN IF NOT EXISTS remote_server VARCHAR(100) DEFAULT 'iceland',
ADD COLUMN IF NOT EXISTS encryption_version INTEGER DEFAULT 2;

-- Create index for remote lookups
CREATE INDEX IF NOT EXISTS idx_newsletter_remote_salt_id
ON newsletter_emails(remote_salt_id);

CREATE INDEX IF NOT EXISTS idx_newsletter_remote_server
ON newsletter_emails(remote_server);

-- Add comments for documentation
COMMENT ON COLUMN newsletter_emails.remote_salt_id IS 'UUID referencing salt stored on remote server (Iceland/Romania/onionhat)';
COMMENT ON COLUMN newsletter_emails.remote_server IS 'Which remote server stores the salt: iceland, romania, or onionhat';
COMMENT ON COLUMN newsletter_emails.encryption_version IS 'Version 1: local salt, Version 2: remote salt (split-key)';

-- Display migration success
SELECT
    'newsletter_emails table updated for split-key storage!' as status,
    COUNT(*) as existing_emails,
    SUM(CASE WHEN remote_salt_id IS NULL THEN 1 ELSE 0 END) as needs_migration
FROM newsletter_emails;
