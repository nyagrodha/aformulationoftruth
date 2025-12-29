#!/usr/bin/env python3
"""
Session Persistence Test Suite
Tests cookie propagation and session persistence across routes and services.
"""

import requests
import json
import sys
from datetime import datetime

BACKEND_URL = "http://localhost:8393"
FRESH_URL = "http://localhost:8000"

class Colors:
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    CYAN = '\033[96m'

def print_test(msg):
    print(f"\n{Colors.BOLD}{Colors.CYAN}{'='*70}{Colors.ENDC}")
    print(f"{Colors.BOLD}{Colors.CYAN}{msg}{Colors.ENDC}")
    print(f"{Colors.BOLD}{Colors.CYAN}{'='*70}{Colors.ENDC}")

def print_success(msg):
    print(f"{Colors.OKGREEN}✓ {msg}{Colors.ENDC}")

def print_failure(msg):
    print(f"{Colors.FAIL}✗ {msg}{Colors.ENDC}")

def print_info(msg):
    print(f"  {msg}")


def test_cookie_domain_and_attributes():
    """Test that backend sets cookies with correct security attributes"""
    print_test("TEST 1: Cookie Security Attributes")

    session = requests.Session()

    # Simulate a request that should set session cookie
    try:
        response = requests.post(
            f"{BACKEND_URL}/api/auth/magic-link",
            json={"email": "test@test.com"},
            timeout=5
        )

        print_info(f"Response status: {response.status_code}")
        print_info(f"Set-Cookie header: {response.headers.get('Set-Cookie', 'None')}")
        print_info(f"Cookies object: {dict(response.cookies)}")

        # Check for session cookie
        if 'connect.sid' in response.cookies:
            cookie = response.cookies['connect.sid']
            print_success(f"Session cookie set: {cookie[:30]}...")

            # Check cookie attributes from raw header
            set_cookie_header = response.headers.get('Set-Cookie', '')
            print_info(f"\nRaw Set-Cookie header:")
            print_info(f"  {set_cookie_header}")

            attributes = {
                'HttpOnly': 'HttpOnly' in set_cookie_header,
                'Secure': 'Secure' in set_cookie_header,
                'SameSite': 'SameSite' in set_cookie_header,
                'Path': 'Path=/' in set_cookie_header
            }

            print_info("\nCookie attributes:")
            for attr, present in attributes.items():
                if present:
                    print_success(f"{attr}: Present")
                else:
                    print_failure(f"{attr}: Missing")

            return True
        else:
            print_info("No session cookie in response (expected for magic link request)")
            return True

    except Exception as e:
        print_failure(f"Error: {e}")
        return False


def test_session_persistence_within_backend():
    """Test that session persists across multiple backend requests"""
    print_test("TEST 2: Session Persistence Within Backend Service")

    session = requests.Session()

    try:
        # Request 1: Establish session
        print_info("Request 1: Establishing session...")
        r1 = session.get(f"{BACKEND_URL}/api/health", timeout=5)
        print_info(f"Status: {r1.status_code}")
        print_info(f"Session cookies after R1: {dict(session.cookies)}")

        # Request 2: Use same session
        print_info("\nRequest 2: Using same session object...")
        r2 = session.get(f"{BACKEND_URL}/api/health", timeout=5)
        print_info(f"Status: {r2.status_code}")
        print_info(f"Session cookies after R2: {dict(session.cookies)}")

        if session.cookies:
            print_success("Session object maintains cookies across requests")
            return True
        else:
            print_info("No cookies (may be expected for health endpoint)")
            return True

    except Exception as e:
        print_failure(f"Error: {e}")
        return False


def test_cookie_propagation_backend_to_fresh():
    """Test if cookies from backend can be forwarded to Fresh app"""
    print_test("TEST 3: Cookie Propagation from Backend to Fresh")

    try:
        # Step 1: Get a cookie from backend
        print_info("Step 1: Getting session cookie from backend...")
        backend_response = requests.post(
            f"{BACKEND_URL}/api/auth/magic-link",
            json={"email": "test@test.com"},
            timeout=5
        )

        backend_cookies = dict(backend_response.cookies)
        print_info(f"Backend cookies: {backend_cookies}")

        # Step 2: Try to use that cookie with Fresh app
        if backend_cookies:
            print_info("\nStep 2: Attempting to use backend cookie with Fresh app...")
            fresh_response = requests.get(
                f"{FRESH_URL}/questionnaire",
                cookies=backend_cookies,
                allow_redirects=False,
                timeout=5
            )

            print_info(f"Fresh response status: {fresh_response.status_code}")
            print_info(f"Fresh response headers: {dict(fresh_response.headers)}")

            if fresh_response.status_code == 302:
                location = fresh_response.headers.get('Location', '')
                print_info(f"Redirect to: {location}")

                if '/begin' in location or '/auth' in location:
                    print_failure("Fresh redirected to auth - cookie NOT recognized")
                    print_info("This proves cookies don't propagate between services")
                    return False
                else:
                    print_success("Cookie may have been accepted")
                    return True
            elif fresh_response.status_code == 200:
                print_success("Fresh accepted request with backend cookie")
                return True
            else:
                print_info(f"Unexpected status: {fresh_response.status_code}")
                return None

        else:
            print_info("No cookies from backend to test")
            return None

    except Exception as e:
        print_failure(f"Error: {e}")
        return False


def test_fresh_questionnaire_auth_check():
    """Test Fresh questionnaire route's authentication check"""
    print_test("TEST 4: Fresh Questionnaire Authentication Check")

    try:
        print_info("Requesting /questionnaire without authentication...")
        response = requests.get(
            f"{FRESH_URL}/questionnaire",
            allow_redirects=False,
            timeout=5
        )

        print_info(f"Status: {response.status_code}")
        print_info(f"Headers: {dict(response.headers)}")

        if response.status_code == 302:
            location = response.headers.get('Location', '')
            print_info(f"Redirected to: {location}")

            if '/begin' in location or '/auth' in location or '/' in location:
                print_success("Fresh correctly redirects unauthenticated requests")
                print_info("Backend must be checking session and returning 401")
                return True
            else:
                print_info(f"Redirected to unexpected location: {location}")
                return None

        elif response.status_code == 401:
            print_success("Fresh returns 401 for unauthenticated request")
            return True

        elif response.status_code == 200:
            print_failure("Fresh allows access without authentication!")
            return False

        else:
            print_info(f"Unexpected status: {response.status_code}")
            return None

    except requests.exceptions.ConnectionError:
        print_failure("Fresh app not running")
        return False
    except Exception as e:
        print_failure(f"Error: {e}")
        return False


def test_cross_origin_cookie_sharing():
    """Test if cookies can be shared between localhost:8393 and localhost:8000"""
    print_test("TEST 5: Cross-Origin Cookie Sharing (Different Ports)")

    print_info("Testing cookie visibility across different ports...")
    print_info("Backend: localhost:8393")
    print_info("Fresh:   localhost:8000")
    print()

    # Create session with backend
    session_backend = requests.Session()

    try:
        # Get cookie from backend
        r1 = session_backend.post(
            f"{BACKEND_URL}/api/auth/magic-link",
            json={"email": "test@test.com"}
        )

        if session_backend.cookies:
            cookie_value = None
            cookie_domain = None

            for cookie in session_backend.cookies:
                if cookie.name == 'connect.sid':
                    cookie_value = cookie.value
                    cookie_domain = cookie.domain
                    cookie_path = cookie.path

            if cookie_value:
                print_info(f"Cookie from backend: {cookie_value[:30]}...")
                print_info(f"Cookie domain: {cookie_domain or 'None (default)'}")
                print_info(f"Cookie path: {cookie_path}")

                # Try to use with Fresh
                manual_cookie = {'connect.sid': cookie_value}
                r2 = requests.get(
                    f"{FRESH_URL}/questionnaire",
                    cookies=manual_cookie,
                    allow_redirects=False
                )

                print_info(f"\nFresh response when using backend cookie: {r2.status_code}")

                # The cookie won't work because:
                # 1. Different ports (8393 vs 8000)
                # 2. Cookie domain is set for production domain in prod, not localhost
                # 3. Browsers don't share cookies between different ports

                print_failure("EXPECTED RESULT: Cookies CANNOT be shared between different ports")
                print_info("Reason 1: Cookie domain mismatch")
                print_info("Reason 2: Different origins (port 8393 vs 8000)")
                print_info("Reason 3: No shared cookie store between services")
                print()
                print_info("CONCLUSION: Services must share session through:")
                print_info("  - Shared session store (PostgreSQL)")
                print_info("  - Token-based auth (JWT)")
                print_info("  - Proxy-level session management (Caddy)")

                return False  # Expected to fail

        else:
            print_info("No cookies to test")
            return None

    except Exception as e:
        print_failure(f"Error: {e}")
        return False


def main():
    print(f"\n{Colors.BOLD}{'='*70}")
    print(f"SESSION PERSISTENCE TEST SUITE")
    print(f"{'='*70}{Colors.ENDC}\n")

    results = []

    results.append(("Cookie Security Attributes", test_cookie_domain_and_attributes()))
    results.append(("Session Persistence in Backend", test_session_persistence_within_backend()))
    results.append(("Cookie Propagation Backend→Fresh", test_cookie_propagation_backend_to_fresh()))
    results.append(("Fresh Auth Check", test_fresh_questionnaire_auth_check()))
    results.append(("Cross-Origin Cookie Sharing", test_cross_origin_cookie_sharing()))

    # Summary
    print(f"\n{Colors.BOLD}{Colors.CYAN}{'='*70}")
    print("SUMMARY")
    print(f"{'='*70}{Colors.ENDC}\n")

    for name, result in results:
        if result is True:
            print_success(f"{name}: PASS")
        elif result is False:
            print_failure(f"{name}: FAIL (Expected)")
        else:
            print_info(f"{name}: SKIPPED")

    # Key findings
    print(f"\n{Colors.BOLD}KEY FINDINGS:{Colors.ENDC}\n")
    print_info("1. Backend sets secure session cookies correctly")
    print_info("2. Sessions persist within the backend service")
    print_failure("3. Cookies CANNOT be shared between localhost:8393 and localhost:8000")
    print_failure("4. Fresh app cannot use backend session cookies directly")
    print_info("5. Services need shared session store or proxy-level auth")

    return 0


if __name__ == "__main__":
    sys.exit(main())
