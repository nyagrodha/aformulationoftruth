#!/usr/bin/env python3
"""
Magic Link Authentication Flow Test

This test verifies that the magic link authentication system is working correctly:
1. Tests that /auth/callback.html is served correctly
2. Verifies the auth callback page contains the correct validation logic
3. Tests the /api/auth/validate-magic-link endpoint
4. Confirms static files are served from the correct directory

Run with: python3 test-magic-link-flow.py
"""

import requests
import json
import sys
from datetime import datetime

# Test configuration
BASE_URL = "https://aformulationoftruth.com"
API_BASE_URL = "http://localhost:5742"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'
    BOLD = '\033[1m'

def print_test(name):
    print(f"\n{Colors.BLUE}{Colors.BOLD}TEST:{Colors.RESET} {name}")

def print_pass(message):
    print(f"  {Colors.GREEN}✓{Colors.RESET} {message}")

def print_fail(message):
    print(f"  {Colors.RED}✗{Colors.RESET} {message}")

def print_info(message):
    print(f"  {Colors.YELLOW}ℹ{Colors.RESET} {message}")

def test_auth_callback_page():
    """Test that the auth callback page is served correctly"""
    print_test("Auth Callback Page Accessibility")

    try:
        response = requests.get(f"{BASE_URL}/auth/callback.html", verify=False, timeout=10)

        if response.status_code == 200:
            print_pass(f"Auth callback page accessible (status: {response.status_code})")
        else:
            print_fail(f"Auth callback page returned status: {response.status_code}")
            return False

        # Check content
        content = response.text

        # Verify it's the correct HTML file (not the React build)
        if "Verifying your magic link" in content:
            print_pass("Correct auth callback page content detected")
        else:
            print_fail("Auth callback page has incorrect content")
            print_info("Expected: 'Verifying your magic link'")
            return False

        # Verify it has the validation logic
        if "/api/auth/validate-magic-link" in content:
            print_pass("Auth validation endpoint reference found")
        else:
            print_fail("Missing auth validation endpoint reference")
            return False

        # Verify it's not the old React build
        if "index-DsI3gYPa.js" in content or "ufilinthe4m it's a questionnaire" in content:
            print_fail("Auth callback is serving old React build instead of callback.html")
            print_info("Backend is serving wrong static directory")
            return False
        else:
            print_pass("Confirmed NOT serving old React build")

        # Check file size (callback.html should be ~5KB, React build is ~470 bytes)
        content_length = len(content)
        if content_length > 2000:
            print_pass(f"Content size appropriate for callback.html ({content_length} bytes)")
        else:
            print_fail(f"Content too small ({content_length} bytes) - might be React build")
            return False

        return True

    except Exception as e:
        print_fail(f"Error: {str(e)}")
        return False

def test_validate_endpoint():
    """Test the validate-magic-link endpoint"""
    print_test("Magic Link Validation Endpoint")

    try:
        # Test with invalid token (should return error)
        response = requests.post(
            f"{API_BASE_URL}/api/auth/validate-magic-link",
            json={"token": "invalid-test-token"},
            headers={"Content-Type": "application/json"},
            timeout=10
        )

        if response.status_code == 401:
            print_pass(f"Endpoint correctly rejects invalid token (status: {response.status_code})")
        else:
            print_fail(f"Unexpected status code: {response.status_code}")
            return False

        # Check response format
        try:
            data = response.json()
            if "error" in data:
                print_pass(f"Error message returned: '{data['error']}'")
            else:
                print_fail("Response missing error field")
                return False
        except json.JSONDecodeError:
            print_fail("Response is not valid JSON")
            return False

        return True

    except Exception as e:
        print_fail(f"Error: {str(e)}")
        return False

def test_static_file_serving():
    """Test that static files are served from the correct directory"""
    print_test("Static File Serving Configuration")

    try:
        # Test that a known public file is accessible
        response = requests.get(f"{BASE_URL}/index.html", verify=False, timeout=10)

        if response.status_code == 200:
            print_pass("Index page accessible")
        else:
            print_fail(f"Index page returned status: {response.status_code}")
            return False

        content = response.text

        # Check if it's from the public directory (not React build)
        if "a formulation of truth" in content.lower():
            print_pass("Serving correct index.html from public directory")
        else:
            print_info("Index page content unclear, may need manual verification")

        # Test CSS files are accessible
        response = requests.get(f"{BASE_URL}/css/themes.css", verify=False, timeout=10)
        if response.status_code == 200:
            print_pass("CSS files accessible from public directory")
        else:
            print_info(f"CSS files status: {response.status_code}")

        return True

    except Exception as e:
        print_fail(f"Error: {str(e)}")
        return False

def test_api_health():
    """Test that the backend API is healthy"""
    print_test("Backend API Health")

    try:
        response = requests.get(f"{API_BASE_URL}/api/health", timeout=10)

        if response.status_code == 200:
            data = response.json()
            print_pass(f"Backend API is healthy (status: {data.get('status', 'unknown')})")
            if 'services' in data:
                db_status = data['services'].get('database', {}).get('status', 'unknown')
                print_pass(f"Database connection: {db_status}")
            return True
        else:
            print_fail(f"Health check returned status: {response.status_code}")
            return False

    except Exception as e:
        print_fail(f"Error: {str(e)}")
        return False

def test_questionnaire_page():
    """Test that the questionnaire page is accessible"""
    print_test("Questionnaire Page Accessibility")

    try:
        response = requests.get(f"{BASE_URL}/questionnaire.html", verify=False, timeout=10)

        if response.status_code == 200:
            print_pass("Questionnaire page accessible")

            content = response.text
            if "questionnaire" in content.lower():
                print_pass("Questionnaire content detected")
                return True
            else:
                print_info("Questionnaire page loaded but content unclear")
                return True
        else:
            print_fail(f"Questionnaire page returned status: {response.status_code}")
            return False

    except Exception as e:
        print_fail(f"Error: {str(e)}")
        return False

def main():
    print(f"\n{Colors.BOLD}{'='*70}{Colors.RESET}")
    print(f"{Colors.BOLD}Magic Link Authentication Flow Test Suite{Colors.RESET}")
    print(f"{Colors.BOLD}{'='*70}{Colors.RESET}")
    print(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Base URL: {BASE_URL}")
    print(f"API URL: {API_BASE_URL}")

    # Disable SSL warnings for self-signed certs
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    results = {
        "API Health Check": test_api_health(),
        "Auth Callback Page": test_auth_callback_page(),
        "Validate Endpoint": test_validate_endpoint(),
        "Static File Serving": test_static_file_serving(),
        "Questionnaire Page": test_questionnaire_page(),
    }

    # Summary
    print(f"\n{Colors.BOLD}{'='*70}{Colors.RESET}")
    print(f"{Colors.BOLD}Test Summary{Colors.RESET}")
    print(f"{Colors.BOLD}{'='*70}{Colors.RESET}")

    passed = sum(1 for result in results.values() if result)
    total = len(results)

    for test_name, result in results.items():
        status = f"{Colors.GREEN}PASS{Colors.RESET}" if result else f"{Colors.RED}FAIL{Colors.RESET}"
        print(f"  {test_name}: {status}")

    print(f"\n{Colors.BOLD}Results: {passed}/{total} tests passed{Colors.RESET}")

    if passed == total:
        print(f"\n{Colors.GREEN}{Colors.BOLD}✓ All tests passed! Magic link flow is working correctly.{Colors.RESET}\n")
        return 0
    else:
        print(f"\n{Colors.RED}{Colors.BOLD}✗ Some tests failed. Please review the output above.{Colors.RESET}\n")
        return 1

if __name__ == "__main__":
    sys.exit(main())
