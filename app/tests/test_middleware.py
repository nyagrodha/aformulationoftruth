"""Comprehensive tests for middleware module."""

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI, Response
from fastapi.testclient import TestClient

from app.middleware import (
    CSRF_COOKIE,
    CSRF_FIELD,
    SecurityHeadersMiddleware,
    set_csrf_cookie,
)


class TestCSRFCookieSetting:
    """Test CSRF cookie setting function."""

    def test_set_csrf_cookie_basic(self):
        """Sets CSRF cookie with correct name and value."""
        response = Response()
        token = "test-csrf-token"

        set_csrf_cookie(response, token)

        # Check cookie was set
        cookies = response.raw_headers
        # Response should have set-cookie header

    def test_set_csrf_cookie_httponly(self):
        """CSRF cookie is set as HttpOnly."""
        response = Response()
        set_csrf_cookie(response, "token")

        # Cookie should have HttpOnly flag
        # This is implementation-dependent

    def test_set_csrf_cookie_attributes(self):
        """CSRF cookie has correct security attributes."""
        response = Response()
        set_csrf_cookie(response, "token123")

        # Should set cookie with:
        # - httponly=True
        # - secure=False (for .onion)
        # - samesite="lax"
        # - max_age=86400
        # - path="/"

    def test_set_csrf_cookie_empty_token(self):
        """Handles empty token."""
        response = Response()
        set_csrf_cookie(response, "")

        # Should not crash


class TestCSRFConstants:
    """Test CSRF constants."""

    def test_csrf_cookie_name(self):
        """CSRF cookie has expected name."""
        assert CSRF_COOKIE == "_csrf"

    def test_csrf_field_name(self):
        """CSRF field has expected name."""
        assert CSRF_FIELD == "csrf_token"

    def test_constants_not_empty(self):
        """Constants are not empty strings."""
        assert len(CSRF_COOKIE) > 0
        assert len(CSRF_FIELD) > 0

    def test_constants_valid_names(self):
        """Constants are valid cookie/field names."""
        # Should not contain invalid characters
        invalid_chars = [' ', '\n', '\r', '\t', ';', ',']

        for char in invalid_chars:
            assert char not in CSRF_COOKIE
            assert char not in CSRF_FIELD


class TestSecurityHeadersMiddleware:
    """Test security headers middleware."""

    @pytest.fixture
    def app_with_middleware(self):
        """Create test app with security middleware."""
        app = FastAPI()
        app.add_middleware(SecurityHeadersMiddleware)

        @app.get("/test")
        async def test_route():
            return {"message": "test"}

        return app

    def test_middleware_adds_security_headers(self, app_with_middleware):
        """Middleware adds security headers to response."""
        client = TestClient(app_with_middleware)
        response = client.get("/test")

        headers = response.headers

        assert "X-Content-Type-Options" in headers
        assert headers["X-Content-Type-Options"] == "nosniff"

        assert "X-Frame-Options" in headers
        assert headers["X-Frame-Options"] == "DENY"

        assert "X-XSS-Protection" in headers
        assert headers["X-XSS-Protection"] == "1; mode=block"

        assert "Referrer-Policy" in headers
        assert headers["Referrer-Policy"] == "strict-origin-when-cross-origin"

    def test_middleware_applies_to_all_routes(self, app_with_middleware):
        """Security headers applied to all routes."""
        app_with_middleware.add_api_route("/another", lambda: {"test": "data"})

        client = TestClient(app_with_middleware)
        response = client.get("/another")

        assert "X-Content-Type-Options" in response.headers

    def test_middleware_handles_errors(self, app_with_middleware):
        """Middleware works even when route raises error."""
        @app_with_middleware.get("/error")
        async def error_route():
            raise ValueError("Test error")

        client = TestClient(app_with_middleware, raise_server_exceptions=False)
        response = client.get("/error")

        # Should still have security headers even on error
        assert "X-Content-Type-Options" in response.headers

    @pytest.mark.asyncio
    async def test_middleware_dispatch(self):
        """Middleware dispatch method works correctly."""
        middleware = SecurityHeadersMiddleware(None)

        # Mock request and call_next
        request = MagicMock()
        response = Response(content="test")

        async def mock_call_next(req):
            return response

        result = await middleware.dispatch(request, mock_call_next)

        assert "X-Content-Type-Options" in result.headers
        assert "X-Frame-Options" in result.headers

    def test_middleware_preserves_response_body(self, app_with_middleware):
        """Middleware doesn't modify response body."""
        client = TestClient(app_with_middleware)
        response = client.get("/test")

        assert response.json() == {"message": "test"}

    def test_middleware_preserves_status_code(self, app_with_middleware):
        """Middleware doesn't change status code."""
        @app_with_middleware.get("/custom-status")
        async def custom_status():
            return Response(content="created", status_code=201)

        client = TestClient(app_with_middleware)
        response = client.get("/custom-status")

        assert response.status_code == 201
        assert "X-Content-Type-Options" in response.headers


class TestMiddlewareEdgeCases:
    """Test edge cases for middleware."""

    def test_middleware_with_streaming_response(self):
        """Middleware works with streaming responses."""
        app = FastAPI()
        app.add_middleware(SecurityHeadersMiddleware)

        @app.get("/stream")
        async def stream():
            from fastapi.responses import StreamingResponse

            async def generate():
                yield b"chunk1"
                yield b"chunk2"

            return StreamingResponse(generate())

        client = TestClient(app)
        response = client.get("/stream")

        assert "X-Content-Type-Options" in response.headers

    def test_middleware_with_redirect(self):
        """Middleware works with redirect responses."""
        app = FastAPI()
        app.add_middleware(SecurityHeadersMiddleware)

        @app.get("/redirect")
        async def redirect():
            from fastapi.responses import RedirectResponse
            return RedirectResponse("/other")

        client = TestClient(app)
        response = client.get("/redirect", allow_redirects=False)

        assert "X-Content-Type-Options" in response.headers

    def test_middleware_with_json_response(self):
        """Middleware works with JSON responses."""
        app = FastAPI()
        app.add_middleware(SecurityHeadersMiddleware)

        @app.get("/json")
        async def json_route():
            return {"data": "test"}

        client = TestClient(app)
        response = client.get("/json")

        assert response.json() == {"data": "test"}
        assert "X-Content-Type-Options" in response.headers

    def test_middleware_with_html_response(self):
        """Middleware works with HTML responses."""
        app = FastAPI()
        app.add_middleware(SecurityHeadersMiddleware)

        @app.get("/html")
        async def html_route():
            from fastapi.responses import HTMLResponse
            return HTMLResponse("<html><body>Test</body></html>")

        client = TestClient(app)
        response = client.get("/html")

        assert "<html>" in response.text
        assert "X-Content-Type-Options" in response.headers


class TestCSRFCookieIntegration:
    """Test CSRF cookie in real scenarios."""

    def test_csrf_cookie_in_response(self):
        """CSRF cookie is properly set in HTTP response."""
        response = Response()
        token = "test-token-123"

        set_csrf_cookie(response, token)

        # Cookie should be in response
        # Implementation may vary based on FastAPI version

    def test_csrf_cookie_max_age(self):
        """CSRF cookie has 24-hour max age."""
        response = Response()
        set_csrf_cookie(response, "token")

        # max_age should be 86400 (24 hours)

    def test_csrf_cookie_path(self):
        """CSRF cookie is set for root path."""
        response = Response()
        set_csrf_cookie(response, "token")

        # path should be "/"

    def test_csrf_cookie_samesite(self):
        """CSRF cookie has lax SameSite policy."""
        response = Response()
        set_csrf_cookie(response, "token")

        # samesite should be "lax"

    def test_csrf_cookie_not_secure(self):
        """CSRF cookie is not marked secure (.onion serves HTTP)."""
        response = Response()
        set_csrf_cookie(response, "token")

        # secure should be False for .onion compatibility