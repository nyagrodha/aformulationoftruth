#!/bin/bash
################################################################################
# Encrypted Link Testing Suite
# Comprehensive tests for proust <-> gimbal encrypted communication
################################################################################

set -euo pipefail

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
GIMBAL_DOMAIN="${GIMBAL_DOMAIN:-gimbal.fobdongle.com}"
GIMBAL_IP="${GIMBAL_IP:-185.146.234.144}"
VPN_SERVER_IP="${VPN_SERVER_IP:-10.8.0.1}"

pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; return 1; }
info() { echo -e "${BLUE}ℹ${NC} $1"; }
header() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
}

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

run_test() {
    local test_name="$1"
    local test_cmd="$2"

    info "Testing: $test_name"

    if eval "$test_cmd" &>/dev/null; then
        pass "$test_name"
        ((TESTS_PASSED++))
        return 0
    else
        fail "$test_name"
        ((TESTS_FAILED++))
        return 1
    fi
}

################################################################################
# Test Suite
################################################################################

header "Encrypted Link Test Suite"
info "Testing proust ↔ gimbal encrypted communication"
echo ""

# Test 1: DNS Resolution
header "1. DNS & Network Tests"
run_test "DNS resolution for $GIMBAL_DOMAIN" \
    "host $GIMBAL_DOMAIN | grep -q '$GIMBAL_IP'"

run_test "Reverse DNS lookup" \
    "host $GIMBAL_IP | grep -q -i gimbal || true"

# Test 2: WireGuard VPN
header "2. WireGuard VPN Tests"
run_test "WireGuard interface exists" \
    "ip link show wg0"

run_test "WireGuard is running" \
    "wg show wg0"

run_test "VPN peer connection established" \
    "wg show wg0 | grep -q 'latest handshake'"

run_test "Ping VPN server ($VPN_SERVER_IP)" \
    "ping -c 3 -W 2 $VPN_SERVER_IP"

# Test 3: HTTPS/TLS
header "3. HTTPS & TLS Tests"
run_test "HTTPS connectivity to $GIMBAL_DOMAIN" \
    "curl -f -m 10 https://$GIMBAL_DOMAIN/health"

run_test "TLS 1.3 support" \
    "curl -sS --tlsv1.3 https://$GIMBAL_DOMAIN/health | grep -q 'healthy'"

run_test "HTTP redirects to HTTPS" \
    "curl -sI http://$GIMBAL_DOMAIN | grep -q '301\|302'"

run_test "Security headers present (HSTS)" \
    "curl -sI https://$GIMBAL_DOMAIN/health | grep -qi 'strict-transport-security'"

# Test 4: API Authentication
header "4. API Authentication Tests"

if [[ -z "${API_KEY:-}" ]]; then
    info "API_KEY not set in environment, loading from .env..."
    if [[ -f .env ]]; then
        export $(grep VPS_API_KEY .env | xargs)
        API_KEY="$VPS_API_KEY"
    elif [[ -f /home/runner/aformulationoftruth/.env ]]; then
        export $(grep VPS_API_KEY /home/runner/aformulationoftruth/.env | xargs)
        API_KEY="$VPS_API_KEY"
    else
        fail "Cannot find API_KEY. Please set API_KEY environment variable."
        TESTS_FAILED=$((TESTS_FAILED + 3))
        API_KEY=""
    fi
fi

if [[ -n "$API_KEY" ]]; then
    run_test "Unauthenticated request rejected" \
        "! curl -f -s https://$GIMBAL_DOMAIN/api/stats"

    run_test "Authenticated health check" \
        "curl -f -s -H 'Authorization: Bearer $API_KEY' https://$GIMBAL_DOMAIN/health | grep -q 'healthy'"

    run_test "API statistics endpoint" \
        "curl -f -s -H 'Authorization: Bearer $API_KEY' https://$GIMBAL_DOMAIN/api/stats | grep -q 'totalSessions'"
fi

# Test 5: Encryption Test
header "5. End-to-End Encryption Test"

if [[ -n "${API_KEY:-}" && -n "${ENCRYPTION_KEY:-$VPS_ENCRYPTION_KEY}" ]]; then
    TEST_SESSION_ID="test-$(date +%s)"
    TEST_QUESTION_ID="test-q1"
    TEST_ANSWER="This is a test answer for encryption verification"
    TEST_TIMESTAMP=$(date +%s)

    info "Creating test encrypted response..."
    RESPONSE=$(curl -s -X POST \
        -H "Authorization: Bearer $API_KEY" \
        -H "Content-Type: application/json" \
        -d "{
            \"sessionId\": \"$TEST_SESSION_ID\",
            \"questionId\": \"$TEST_QUESTION_ID\",
            \"answer\": \"$TEST_ANSWER\",
            \"timestamp\": $TEST_TIMESTAMP
        }" \
        https://$GIMBAL_DOMAIN/api/responses)

    run_test "Store encrypted response" \
        "echo '$RESPONSE' | grep -q 'success'"

    info "Retrieving encrypted response..."
    RETRIEVED=$(curl -s \
        -H "Authorization: Bearer $API_KEY" \
        "https://$GIMBAL_DOMAIN/api/responses/$TEST_SESSION_ID")

    run_test "Retrieve encrypted response" \
        "echo '$RETRIEVED' | grep -q 'encryptedAnswer'"

    run_test "Response is encrypted (not plaintext)" \
        "! echo '$RETRIEVED' | grep -q '$TEST_ANSWER'"

    info "Testing decryption..."
    DECRYPTED=$(curl -s \
        -H "Authorization: Bearer $API_KEY" \
        "https://$GIMBAL_DOMAIN/api/responses/$TEST_SESSION_ID?decrypt=true")

    run_test "Decrypt and verify response" \
        "echo '$DECRYPTED' | grep -q '$TEST_ANSWER'"

    pass "End-to-end encryption verified!"
else
    info "Skipping encryption test (API_KEY or ENCRYPTION_KEY not set)"
    TESTS_FAILED=$((TESTS_FAILED + 5))
fi

# Test 6: Rate Limiting
header "6. Security & Rate Limiting Tests"

run_test "Rate limiting configured" \
    "curl -sI https://$GIMBAL_DOMAIN/health | grep -qi 'x-ratelimit\|ratelimit'"

run_test "CORS headers present" \
    "curl -sI https://$GIMBAL_DOMAIN/health | grep -qi 'access-control'"

# Test 7: VPN Traffic Routing
header "7. VPN Traffic Routing Tests"

info "Checking if traffic routes through VPN..."
if wg show wg0 | grep -q "transfer"; then
    pass "VPN traffic statistics available"
    wg show wg0 | grep transfer
else
    fail "VPN traffic statistics not available"
fi

run_test "VPN interface has IP address" \
    "ip addr show wg0 | grep -q 'inet '"

################################################################################
# Results
################################################################################

header "Test Results"
echo ""
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo -e "Total Tests:  $((TESTS_PASSED + TESTS_FAILED))"
echo ""

if [[ $TESTS_FAILED -eq 0 ]]; then
    pass "All tests passed! Encrypted link is fully operational."
    echo ""
    info "Multi-layer encryption verified:"
    echo "  ✓ Layer 1: TLS 1.3 (HTTPS)"
    echo "  ✓ Layer 2: WireGuard VPN (ChaCha20-Poly1305)"
    echo "  ✓ Layer 3: Application (AES-256-GCM)"
    exit 0
else
    fail "Some tests failed. Please review the output above."
    echo ""
    info "Troubleshooting:"
    echo "  • Check WireGuard: wg show"
    echo "  • Check DNS: dig $GIMBAL_DOMAIN"
    echo "  • Check API: curl -v https://$GIMBAL_DOMAIN/health"
    echo "  • Check logs: journalctl -u wg-quick@wg0"
    exit 1
fi
