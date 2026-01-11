-- Add isAdmin field to users table
-- Admin users are exempt from the 1-in-2-months rate limiting rule

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- Make nyagrodha@me.com an admin user
UPDATE users SET is_admin = true WHERE email = 'nyagrodha@me.com';

-- Create index for admin checks (optional optimization)
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin) WHERE is_admin = true;
