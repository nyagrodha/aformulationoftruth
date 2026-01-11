# Database Migrations - Tiered Profile System

## Running Migration 0002

This migration adds:
- Paid profile system ($3 tier)
- Client-side X25519 encryption for paid users
- Newsletter unsubscribe tokens
- Payment code verification system
- Response version history

### On Main Server (37.228.129.173)

```bash
# Method 1: Using psql directly
PGPASSWORD='your_password' psql -U a4m_app -d a4m_db -f /var/www/aformulationoftruth/migrations/0002_add_paid_profiles_and_privacy_features.sql

# Method 2: Using application database connection
cd /var/www/aformulationoftruth
node -e "
const { db } = require('./server/db');
const fs = require('fs');
const sql = fs.readFileSync('./migrations/0002_add_paid_profiles_and_privacy_features.sql', 'utf8');
db.execute(sql).then(() => console.log('Migration complete!')).catch(console.error);
"
```

### Verify Migration

```sql
-- Check new columns exist
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'users'
AND column_name IN ('profile_tier', 'encryption_type', 'public_key', 'username');

-- Check payment_codes table exists
SELECT * FROM payment_codes LIMIT 1;

-- Check newsletter unsubscribe tokens
SELECT count(*) FROM newsletter_emails WHERE unsubscribe_token IS NOT NULL;
```

### Rollback (if needed)

```sql
-- Remove new columns from users
ALTER TABLE users
DROP COLUMN IF EXISTS profile_tier,
DROP COLUMN IF EXISTS encryption_type,
DROP COLUMN IF EXISTS public_key,
DROP COLUMN IF EXISTS username,
DROP COLUMN IF EXISTS bio,
DROP COLUMN IF EXISTS profile_visibility;

-- Remove payment_codes table
DROP TABLE IF EXISTS payment_codes CASCADE;

-- Remove new columns from responses
ALTER TABLE responses
DROP COLUMN IF EXISTS encryption_type,
DROP COLUMN IF EXISTS encrypted_data,
DROP COLUMN IF EXISTS nonce,
DROP COLUMN IF EXISTS version,
DROP COLUMN IF EXISTS previous_version_id;

-- Remove unsubscribe token from newsletter
ALTER TABLE newsletter_emails
DROP COLUMN IF EXISTS unsubscribe_token;
```
