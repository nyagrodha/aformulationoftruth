#!/bin/bash
# Run session persistence tests
# Checks if services are running and provides instructions if not

set -e

# Configuration - these should match the test script defaults
BACKEND_URL="${BACKEND_URL:-http://localhost:7781}"
FRESH_URL="${FRESH_URL:-http://localhost:7268}"

echo "Session Persistence Test Runner"
echo "================================"
echo ""
echo "Configuration:"
echo "  Backend URL: $BACKEND_URL"
echo "  Fresh URL:   $FRESH_URL"
echo ""

# Check if backend is running
echo "Checking services..."
backend_running=false
fresh_running=false

if curl -s "${BACKEND_URL}/api/health" > /dev/null 2>&1; then
    echo "  [OK] Backend is running"
    backend_running=true
else
    echo "  [!!] Backend is NOT running at ${BACKEND_URL}"
fi

# Check if Fresh is running
if curl -s "${FRESH_URL}/" > /dev/null 2>&1; then
    echo "  [OK] Fresh is running"
    fresh_running=true
else
    echo "  [!!] Fresh is NOT running at ${FRESH_URL}"
fi

echo ""

# If services aren't running, provide instructions
if [ "$backend_running" = false ] || [ "$fresh_running" = false ]; then
    echo "Some services are not running. Please start them first:"
    echo ""

    if [ "$backend_running" = false ]; then
        echo "  Start backend:"
        echo "    cd /var/www/aformulationoftruth && npm run dev"
        echo ""
    fi

    if [ "$fresh_running" = false ]; then
        echo "  Start Fresh:"
        echo "    cd /var/www/aformulationoftruth/fresh-questionnaire && deno task start"
        echo ""
    fi

    echo "Then run this script again."
    exit 1
fi

# Run the tests
echo "Running session persistence tests..."
echo ""

cd /var/www/aformulationoftruth
python3 test-session-persistence.py
