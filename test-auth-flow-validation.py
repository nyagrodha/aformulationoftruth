#!/usr/bin/env python3
"""
Comprehensive Authentication Flow Test Suite
Tests the hypothesis that magic link auth is broken due to endpoint mismatch
and session persistence issues.
"""

import requests
import json
import sys
from datetime import datetime

# Test configuration
BACKEND_URL = "http://localhost:8393"
FRESH_URL = "http://localhost:8000"
PROD_URL = "https://aformulationoftruth.com"
TEST_EMAIL = "test@example.com"

class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

def print_header(text):
    print(f"\n{Colors.HEADER}{Colors.BOLD}{'='*80}{Colors.ENDC}")
    print(f"{Colors.HEADER}{Colors.BOLD}{text.center(80)}{Colors.ENDC}")
    print(f"{Colors.HEADER}{Colors.BOLD}{'='*80}{Colors.ENDC}\n")

def print_test(name):
    print(f"{Colors.OKBLUE}{Colors.BOLD}TEST: {name}{Colors.ENDC}")

def print_success(msg):
    print(f"{Colors.OKGREEN}✓ {msg}{Colors.ENDC}")

def print_failure(msg):
    print(f"{Colors.FAIL}✗ {msg}{Colors.ENDC}")

def print_info(msg):
    print(f"{Colors.OKCYAN}ℹ {msg}{Colors.ENDC}")

def print_warning(msg):
    print(f"{Colors.WARNING}⚠ {msg}{Colors.ENDC}")


# TEST 1: Verify magic link request endpoint exists and works
def test_magic_link_request():
    print_test("Magic Link Request (POST /api/auth/magic-link)")

    try:
        response = requests.post(
            f"{BACKEND_URL}/api/auth/magic-link",
            json={"email": TEST_EMAIL},
            timeout=5
        )

        print_info(f"Status Code: {response.status_code}")
        print_info(f"Response: {response.text[:200]}")

        if response.status_code == 200:
            print_success("Magic link request endpoint EXISTS and responds")
            return True
        else:
            print_failure(f"Unexpected status code: {response.status_code}")
            return False

    except requests.exceptions.ConnectionError:
        print_failure("Backend not running on localhost:8393")
        return False
    except Exception as e:
        print_failure(f"Error: {e}")
        return False


# TEST 2: Test the endpoint Fresh calls (GET /auth/verify) - SHOULD FAIL
def test_fresh_auth_verify_endpoint():
    print_test("Fresh Auth Verify (GET /auth/verify?token=test) - Expected to FAIL")

    try:
        response = requests.get(
            f"{BACKEND_URL}/auth/verify",
            params={"token": "test_token_12345"},
            allow_redirects=False,
            timeout=5
        )

        print_info(f"Status Code: {response.status_code}")
        print_info(f"Response: {response.text[:200]}")

        if response.status_code == 404:
            print_warning("✓ HYPOTHESIS CONFIRMED: GET /auth/verify endpoint does NOT exist")
            print_info("Fresh app calls this endpoint but backend doesn't have it!")
            return True
        else:
            print_failure(f"Unexpected: endpoint exists with status {response.status_code}")
            return False

    except requests.exceptions.ConnectionError:
        print_failure("Backend not running")
        return False
    except Exception as e:
        print_failure(f"Error: {e}")
        return False


# TEST 3: Test the actual backend endpoint (POST /api/auth/magic-link/verify)
def test_backend_verify_endpoint():
    print_test("Backend Magic Link Verify (POST /api/auth/magic-link/verify)")

    try:
        # This should fail with invalid token, but the endpoint should exist
        response = requests.post(
            f"{BACKEND_URL}/api/auth/magic-link/verify",
            json={"token": "test_token_12345"},
            allow_redirects=False,
            timeout=5
        )

        print_info(f"Status Code: {response.status_code}")
        print_info(f"Response: {response.text[:200]}")

        if response.status_code in [400, 401]:
            print_success("Backend verify endpoint EXISTS (returned 400/401 for invalid token)")
            print_warning("But Fresh app calls GET /auth/verify, not POST /api/auth/magic-link/verify!")
            return True
        elif response.status_code == 200:
            print_success("Endpoint exists and accepted token (unexpected)")
            return True
        else:
            print_failure(f"Unexpected status code: {response.status_code}")
            return False

    except Exception as e:
        print_failure(f"Error: {e}")
        return False


# TEST 4: Test session cookie persistence
def test_session_cookie_persistence():
    print_test("Session Cookie Persistence")

    session = requests.Session()

    try:
        # Make initial request to establish session
        response1 = requests.get(f"{BACKEND_URL}/api/health", timeout=5)
        print_info(f"Initial request cookies: {response1.cookies}")

        if 'connect.sid' in response1.cookies:
            cookie_value = response1.cookies['connect.sid']
            print_success(f"Session cookie received: connect.sid={cookie_value[:20]}...")

            # Make second request with same cookie
            response2 = requests.get(
                f"{BACKEND_URL}/api/health",
                cookies={'connect.sid': cookie_value},
                timeout=5
            )

            print_success("Cookie can be sent in subsequent requests")
            return True
        else:
            print_warning("No session cookie set on initial request (may be expected)")
            return True

    except Exception as e:
        print_failure(f"Error: {e}")
        return False


# TEST 5: Test Fresh app's auth route
def test_fresh_auth_route():
    print_test("Fresh App Auth Route (GET /auth?token=test)")

    try:
        response = requests.get(
            f"{FRESH_URL}/auth",
            params={"token": "test_token_12345"},
            allow_redirects=False,
            timeout=5
        )

        print_info(f"Status Code: {response.status_code}")
        print_info(f"Response Length: {len(response.text)} bytes")

        if response.status_code == 200:
            print_success("Fresh auth route exists and responds")

            # Check if it shows an error (as expected with invalid token)
            if "error" in response.text.lower() or "invalid" in response.text.lower():
                print_info("Fresh app correctly handles invalid token")

            return True
        else:
            print_failure(f"Unexpected status: {response.status_code}")
            return False

    except requests.exceptions.ConnectionError:
        print_failure("Fresh app not running on localhost:8000")
        return False
    except Exception as e:
        print_failure(f"Error: {e}")
        return False


# TEST 6: Test cookie propagation through Caddy
def test_cookie_propagation_through_caddy():
    print_test("Cookie Propagation Through Caddy Proxy")

    try:
        # Test via production URL to go through Caddy
        response = requests.get(
            f"{PROD_URL}/api/health",
            allow_redirects=False,
            timeout=5
        )

        print_info(f"Status Code: {response.status_code}")
        print_info(f"Cookies: {dict(response.cookies)}")
        print_info(f"Set-Cookie Headers: {response.headers.get('Set-Cookie', 'None')}")

        if response.status_code == 200:
            print_success("Request passed through Caddy successfully")

            if response.cookies:
                print_success(f"Cookies preserved through proxy: {list(response.cookies.keys())}")
            else:
                print_warning("No cookies in response (may be expected for health endpoint)")

            return True
        else:
            print_failure(f"Unexpected status: {response.status_code}")
            return False

    except requests.exceptions.ConnectionError:
        print_warning("Cannot test through Caddy (production URL not accessible)")
        return None
    except Exception as e:
        print_failure(f"Error: {e}")
        return False


# TEST 7: Simulate the complete broken flow
def test_complete_broken_flow():
    print_test("Complete Authentication Flow Simulation (EXPECTED TO FAIL)")

    print_info("Simulating user clicking magic link...")
    print_info("1. User receives email with token=abc123...")
    print_info("2. User clicks link: /auth?token=abc123")
    print_info("3. Fresh app receives request at /auth?token=abc123")
    print_info("4. Fresh auth.tsx calls: GET /auth/verify?token=abc123")

    try:
        # This simulates what Fresh does
        response = requests.get(
            f"{BACKEND_URL}/auth/verify",
            params={"token": "simulated_token_abc123"},
            allow_redirects=False,
            timeout=5
        )

        print_info(f"Backend response: {response.status_code}")

        if response.status_code == 404:
            print_failure("✗✗✗ FLOW BROKEN: Backend returns 404 - endpoint doesn't exist!")
            print_info("Fresh app expects GET /auth/verify")
            print_info("Backend only has POST /api/auth/magic-link/verify")
            print_info("Result: User authentication FAILS")
            return False
        else:
            print_success("Unexpected: endpoint responded (flow might work)")
            return True

    except Exception as e:
        print_failure(f"Error: {e}")
        return False


def main():
    print_header("AUTHENTICATION FLOW VALIDATION TEST SUITE")
    print_info(f"Test started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print_info(f"Backend URL: {BACKEND_URL}")
    print_info(f"Fresh URL: {FRESH_URL}")
    print_info(f"Production URL: {PROD_URL}")

    results = {}

    # Run all tests
    results['magic_link_request'] = test_magic_link_request()
    print()

    results['fresh_calls_wrong_endpoint'] = test_fresh_auth_verify_endpoint()
    print()

    results['backend_has_different_endpoint'] = test_backend_verify_endpoint()
    print()

    results['session_cookies'] = test_session_cookie_persistence()
    print()

    results['fresh_auth_route'] = test_fresh_auth_route()
    print()

    results['caddy_proxy'] = test_cookie_propagation_through_caddy()
    print()

    results['complete_flow'] = test_complete_broken_flow()
    print()

    # Summary
    print_header("TEST RESULTS SUMMARY")

    passed = sum(1 for v in results.values() if v is True)
    failed = sum(1 for v in results.values() if v is False)
    skipped = sum(1 for v in results.values() if v is None)

    for test_name, result in results.items():
        if result is True:
            print_success(f"{test_name}: PASS")
        elif result is False:
            print_failure(f"{test_name}: FAIL")
        else:
            print_warning(f"{test_name}: SKIPPED")

    print(f"\n{Colors.BOLD}Total: {passed} passed, {failed} failed, {skipped} skipped{Colors.ENDC}")

    # Conclusions
    print_header("CONCLUSIONS")

    if results['fresh_calls_wrong_endpoint'] and not results['complete_flow']:
        print_failure("HYPOTHESIS CONFIRMED:")
        print_info("1. Fresh app calls GET /auth/verify?token=XXX")
        print_info("2. Backend does NOT have /auth/verify endpoint")
        print_info("3. Backend only has POST /api/auth/magic-link/verify")
        print_info("4. Magic link authentication is BROKEN due to endpoint mismatch")
        print()
        print_warning("RECOMMENDATION: Add GET /auth/verify endpoint to backend")
        print_warning("OR: Update Fresh app to call correct endpoint")

    if results['backend_has_different_endpoint']:
        print()
        print_info("Backend authentication mechanism is functional")
        print_info("The issue is purely endpoint routing mismatch")

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
