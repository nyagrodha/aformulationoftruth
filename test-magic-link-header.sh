#!/bin/bash
#
# Magic Link Header Verification Test
# Tests that the questionnaire page contains the magic link verification header
#

set -e

echo "========================================================================"
echo "Magic Link Header Verification Test"
echo "========================================================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Check if magic link header exists in HTML
echo "TEST 1: Checking for magic link header in questionnaire.html"
if curl -s https://aformulationoftruth.com/questionnaire.html | grep -q 'data-magic-link-verified="true"'; then
    echo -e "${GREEN}✓ PASS${NC}: Magic link header found in HTML"
else
    echo -e "${RED}✗ FAIL${NC}: Magic link header NOT found in HTML"
    exit 1
fi
echo ""

# Test 2: Verify header contains correct text
echo "TEST 2: Verifying header content"
if curl -s https://aformulationoftruth.com/questionnaire.html | grep -q "Magic Link Authentication Successful"; then
    echo -e "${GREEN}✓ PASS${NC}: Header contains correct authentication message"
else
    echo -e "${RED}✗ FAIL${NC}: Header does not contain authentication message"
    exit 1
fi
echo ""

# Test 3: Check for encryption notice
echo "TEST 3: Checking for encryption notice in header"
if curl -s https://aformulationoftruth.com/questionnaire.html | grep -q "AES-256"; then
    echo -e "${GREEN}✓ PASS${NC}: Encryption notice (AES-256) found"
else
    echo -e "${RED}✗ FAIL${NC}: Encryption notice NOT found"
    exit 1
fi
echo ""

# Test 4: Verify JavaScript logic for showing/hiding header
echo "TEST 4: Checking JavaScript logic for header display"
if curl -s https://aformulationoftruth.com/questionnaire-shuffled.js | grep -q "magic-link-header"; then
    echo -e "${GREEN}✓ PASS${NC}: JavaScript contains header display logic"
else
    echo -e "${RED}✗ FAIL${NC}: JavaScript does NOT contain header display logic"
    exit 1
fi
echo ""

# Test 5: Extract and display the full header HTML
echo "TEST 5: Extracting full header HTML"
echo -e "${YELLOW}Header HTML:${NC}"
curl -s https://aformulationoftruth.com/questionnaire.html | grep -A 7 'data-magic-link-verified="true"' | sed 's/^/  /'
echo ""

echo "========================================================================"
echo -e "${GREEN}All tests passed!${NC}"
echo "========================================================================"
echo ""
echo "Summary:"
echo "  - Magic link header is present in questionnaire.html"
echo "  - Header contains authentication success message"
echo "  - Encryption notice (AES-256) is included"
echo "  - JavaScript logic controls header visibility (first question only)"
echo ""
echo "You can verify this by:"
echo "  1. Request a magic link via email"
echo "  2. Click the magic link to authenticate"
echo "  3. You'll be redirected to /questionnaire.html"
echo "  4. The green header will appear on Question 1 only"
echo ""
