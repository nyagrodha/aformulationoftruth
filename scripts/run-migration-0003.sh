#!/bin/bash
#
# Run Migration 0003: Add salt column to newsletter_emails table
#
# This migration adds support for per-encryption random salts in the newsletter emails encryption system.
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo "🔄 Running Migration 0003: Add salt column to newsletter_emails"
echo "================================================================"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ ERROR: .env file not found"
    echo "Please create a .env file with DATABASE_URL"
    exit 1
fi

# Load environment variables
source .env

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL not set in .env file"
    exit 1
fi

echo "📊 Database: $DATABASE_URL"
echo ""

# Run the migration
echo "⚙️  Executing migration SQL..."
psql "$DATABASE_URL" -f "$PROJECT_ROOT/migrations/0003_add_salt_to_newsletter_emails.sql"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Migration completed successfully!"
    echo ""
    echo "📝 The newsletter_emails table now includes a 'salt' column."
    echo "   New email signups will automatically use per-encryption random salts."
    echo "   Legacy entries (without salt) can still be decrypted correctly."
    echo ""
    echo "Next steps:"
    echo "  1. Restart your application server to pick up the schema changes"
    echo "  2. Test newsletter signup at /contact.html"
    echo "  3. Verify encryption works: npm run decrypt-emails"
else
    echo ""
    echo "❌ Migration failed!"
    echo "Please check the error messages above."
    exit 1
fi
