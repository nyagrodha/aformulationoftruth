#!/bin/bash
#
# Newsletter Email Decryption Script
# Decrypts all newsletter emails from the database
#
# Usage:
#   ./scripts/decrypt-emails.sh           # Display decrypted emails
#   ./scripts/decrypt-emails.sh --output  # Save to JSON file
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ ERROR: .env file not found in project root"
    echo "Please create a .env file with DATABASE_URL and VPS_ENCRYPTION_KEY"
    exit 1
fi

# Load environment variables
source .env

# Check for required environment variables
if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL not set in .env file"
    exit 1
fi

if [ -z "$VPS_ENCRYPTION_KEY" ] && [ -z "$ENCRYPTION_KEY" ]; then
    echo "❌ ERROR: VPS_ENCRYPTION_KEY or ENCRYPTION_KEY not set in .env file"
    exit 1
fi

# Check if tsx is installed
if ! command -v tsx &> /dev/null; then
    echo "📦 Installing tsx..."
    npm install -g tsx
fi

# Run the decryption script
echo "🚀 Starting newsletter email decryption..."
echo ""

tsx "$SCRIPT_DIR/decrypt-newsletter-emails.ts" "$@"
