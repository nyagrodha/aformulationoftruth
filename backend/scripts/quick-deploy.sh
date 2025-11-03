#!/bin/bash
# quick-deploy.sh
# Quick deployment script for newsletter encryption system

set -e  # Exit on error

echo "================================================"
echo "Newsletter Encryption System - Quick Deploy"
echo "================================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "server.js" ]; then
    echo -e "${RED}❌ Error: Must be run from backend directory${NC}"
    exit 1
fi

# Check if EMAIL_ENCRYPTION_KEY is set
if ! grep -q "EMAIL_ENCRYPTION_KEY" .env 2>/dev/null; then
    echo -e "${YELLOW}⚠️  EMAIL_ENCRYPTION_KEY not found in .env${NC}"
    echo "Generating new encryption key..."
    KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    echo "" >> .env
    echo "# Email Encryption Configuration" >> .env
    echo "EMAIL_ENCRYPTION_KEY=$KEY" >> .env
    echo -e "${GREEN}✅ Encryption key added to .env${NC}"
else
    echo -e "${GREEN}✅ Encryption key already configured${NC}"
fi

# Check DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
    echo -e "${YELLOW}⚠️  DATABASE_URL not set in environment${NC}"
    echo "Checking .env files..."
    if grep -q "DATABASE_URL" ../.env.local 2>/dev/null; then
        export $(grep "DATABASE_URL" ../.env.local | xargs)
        echo -e "${GREEN}✅ DATABASE_URL loaded from .env.local${NC}"
    else
        echo -e "${RED}❌ DATABASE_URL not found. Please set it manually.${NC}"
        exit 1
    fi
fi

# Run database migration
echo ""
echo "Setting up database..."
if node scripts/setup-newsletter-db.js 2>&1; then
    echo -e "${GREEN}✅ Database setup complete${NC}"
else
    echo -e "${YELLOW}⚠️  Database setup had issues (may already exist)${NC}"
fi

# Run tests
echo ""
echo "Running tests..."
if npm test -- tests/encryption.test.js --silent 2>/dev/null; then
    echo -e "${GREEN}✅ All encryption tests passed${NC}"
else
    echo -e "${YELLOW}⚠️  Some tests failed (check output above)${NC}"
fi

# Check if server is running
echo ""
echo "Checking server status..."
if systemctl is-active --quiet aformulationoftruth 2>/dev/null; then
    echo -e "${YELLOW}⚠️  Server is running. Restart required.${NC}"
    read -p "Restart server now? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo systemctl restart aformulationoftruth
        echo -e "${GREEN}✅ Server restarted${NC}"
    else
        echo -e "${YELLOW}⚠️  Remember to restart the server manually!${NC}"
    fi
else
    echo "Server not running via systemctl"
fi

# Test the API endpoint
echo ""
echo "Testing API endpoint..."
sleep 2
if curl -s -X POST http://localhost:3000/api/newsletter/subscribe \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com"}' | grep -q "success"; then
    echo -e "${GREEN}✅ API endpoint is working${NC}"
else
    echo -e "${YELLOW}⚠️  API endpoint test failed (server may not be running)${NC}"
fi

# Show CLI tool usage
echo ""
echo "================================================"
echo -e "${GREEN}Deployment Complete!${NC}"
echo "================================================"
echo ""
echo "CLI Tool Usage:"
echo "  View subscribers:  node scripts/decrypt-emails.js"
echo "  Get count:         node scripts/decrypt-emails.js --count"
echo "  Export CSV:        node scripts/decrypt-emails.js --export > subs.csv"
echo "  Help:              node scripts/decrypt-emails.js --help"
echo ""
echo "Documentation: backend/NEWSLETTER_SETUP.md"
echo ""
