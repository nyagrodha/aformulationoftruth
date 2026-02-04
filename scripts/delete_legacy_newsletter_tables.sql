-- Legacy Newsletter Tables Deletion Script
--
-- BEFORE RUNNING THIS SCRIPT:
-- 1. Export/decrypt any emails you need from newsletter_emails using:
--    deno run --allow-env --allow-net scripts/decrypt_legacy_emails.ts
--
-- 2. Verify newsletter_unified is working properly:
--    SELECT COUNT(*), status FROM newsletter_unified GROUP BY status;
--
-- 3. Back up the database:
--    pg_dump -Fc $DATABASE_URL > backup_$(date +%Y%m%d).dump
--
-- Tables to delete:
--   - newsletter_emails: Old encrypted email storage (5 rows)
--   - newsletter_subscribers: Migration 003 format, never populated (3 rows)
--   - fresh_newsletter: Empty legacy table (0 rows)
--
-- The new unified table is: newsletter_unified
--

-- Step 1: Verify counts before deletion
SELECT 'newsletter_emails' as table_name, COUNT(*) as row_count FROM newsletter_emails
UNION ALL
SELECT 'newsletter_subscribers', COUNT(*) FROM newsletter_subscribers
UNION ALL
SELECT 'fresh_newsletter', COUNT(*) FROM fresh_newsletter
UNION ALL
SELECT 'newsletter_unified', COUNT(*) FROM newsletter_unified;

-- Step 2: Drop the legacy tables (DESTRUCTIVE - uncomment to run)
-- DROP TABLE IF EXISTS newsletter_emails CASCADE;
-- DROP TABLE IF EXISTS newsletter_subscribers CASCADE;
-- DROP TABLE IF EXISTS fresh_newsletter CASCADE;

-- Step 3: Verify only unified table remains
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name LIKE '%newsletter%';
