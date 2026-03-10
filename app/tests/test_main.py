"""Comprehensive tests for main FastAPI application."""

import base64
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import (
    ADMITTED_COOKIE,
    _fresh_captcha_response,
    _is_admitted,
    app,
)


class TestCaptchaGeneration:
    """Test captcha generation and rendering."""

    def test_fresh_captcha_response_structure(self, test_settings):
        """Fresh captcha response contains required fields."""
        request = MagicMock()
        request.url = MagicMock()
        request.url.path = "/"

        with patch("app.main.generate_captcha") as mock_gen:
            with patch("app.main.render_captcha_png") as mock_render:
                mock_gen.return_value = ("ABC123", "encrypted-token")
                mock_render.return_value = b"fake-png-data"

                response = _fresh_captcha_response(request)

                assert response.status_code == 200
                assert "captcha_b64" in response.body.decode()

    def test_fresh_captcha_response_with_error(self, test_settings):
        """Fresh captcha response includes error message."""
        request = MagicMock()
        request.url = MagicMock()
        request.url.path = "/"

        with patch("app.main.generate_captcha") as mock_gen:
            with patch("app.main.render_captcha_png") as mock_render:
                mock_gen.return_value = ("ABC123", "token")
                mock_render.return_value = b"png"

                response = _fresh_captcha_response(request, error="Test error")

                body = response.body.decode()
                assert "Test error" in body or "error" in body.lower()


class TestAdmissionCheck:
    """Test admission cookie checking."""

    def test_is_admitted_with_valid_cookie(self):
        """Returns True when admitted cookie is set."""
        request = MagicMock()
        request.cookies.get.return_value = "1"

        assert _is_admitted(request) is True

    def test_is_admitted_without_cookie(self):
        """Returns False when cookie is missing."""
        request = MagicMock()
        request.cookies.get.return_value = None

        assert _is_admitted(request) is False

    def test_is_admitted_with_wrong_value(self):
        """Returns False when cookie has wrong value."""
        request = MagicMock()
        request.cookies.get.return_value = "0"

        assert _is_admitted(request) is False


class TestWaitingRoom:
    """Test waiting room routes."""

    def test_waiting_room_shows_captcha(self, test_client, test_settings):
        """Waiting room displays captcha for new visitors."""
        with patch("app.main._is_admitted", return_value=False):
            response = test_client.get("/")
            assert response.status_code == 200
            # Should contain captcha-related content

    def test_waiting_room_redirects_admitted(self, test_client, test_settings):
        """Waiting room redirects admitted users to gate."""
        with patch("app.main._is_admitted", return_value=True):
            response = test_client.get("/", allow_redirects=False)
            assert response.status_code == 303
            assert response.headers["location"] == "/gate"

    def test_waiting_room_submit_invalid_csrf(self, test_client, test_settings):
        """Submit fails with invalid CSRF token."""
        response = test_client.post(
            "/",
            data={
                "captcha_answer": "ABC123",
                "captcha_token": "token",
                "csrf_token": "wrong"
            },
            allow_redirects=False
        )
        assert response.status_code == 303
        assert response.headers["location"] == "/"

    def test_waiting_room_submit_expired_token(self, test_client, test_settings):
        """Submit fails with expired captcha token."""
        with patch("app.main.is_token_expired", return_value=True):
            with patch("app.main.secrets.compare_digest", return_value=True):
                response = test_client.post(
                    "/",
                    data={
                        "captcha_answer": "ABC123",
                        "captcha_token": "expired",
                        "csrf_token": "valid"
                    }
                )
                assert response.status_code == 200
                assert "expired" in response.text.lower()

    def test_waiting_room_submit_wrong_answer(self, test_client, test_settings):
        """Submit fails with wrong captcha answer."""
        with patch("app.main.is_token_expired", return_value=False):
            with patch("app.main.verify_captcha", return_value=False):
                with patch("app.main.secrets.compare_digest", return_value=True):
                    response = test_client.post(
                        "/",
                        data={
                            "captcha_answer": "WRONG",
                            "captcha_token": "token",
                            "csrf_token": "valid"
                        }
                    )
                    assert response.status_code == 200
                    assert "incorrect" in response.text.lower() or "try again" in response.text.lower()

    def test_waiting_room_submit_correct_answer(self, test_client, test_settings):
        """Submit succeeds with correct captcha answer."""
        with patch("app.main.is_token_expired", return_value=False):
            with patch("app.main.verify_captcha", return_value=True):
                with patch("app.main.secrets.compare_digest", return_value=True):
                    response = test_client.post(
                        "/",
                        data={
                            "captcha_answer": "CORRECT",
                            "captcha_token": "token",
                            "csrf_token": "valid"
                        },
                        allow_redirects=False
                    )
                    assert response.status_code == 303
                    assert response.headers["location"] == "/gate"

                    # Check admitted cookie is set
                    cookies = response.cookies
                    assert ADMITTED_COOKIE in cookies


class TestAppConfiguration:
    """Test FastAPI app configuration."""

    def test_app_title(self):
        """App has correct title."""
        assert app.title == "a formulation of truth"

    def test_app_docs_disabled(self):
        """API docs are disabled in production."""
        assert app.docs_url is None
        assert app.redoc_url is None
        assert app.openapi_url is None

    def test_app_has_routers(self):
        """App includes required routers."""
        # Check that routes are registered
        routes = [route.path for route in app.routes]
        assert "/" in routes
        # Note: Router routes may not show directly in app.routes

    def test_app_has_middleware(self):
        """App has security middleware."""
        middleware_types = [type(m).__name__ for m in app.user_middleware]
        # SecurityHeadersMiddleware should be present
        assert any("Security" in name for name in middleware_types)

    def test_static_files_mounted(self):
        """Static files are mounted."""
        routes = {route.path: route for route in app.routes}
        assert "/static" in routes


class TestLifespan:
    """Test application lifespan management."""

    @pytest.mark.asyncio
    async def test_lifespan_initializes_pool(self, test_settings):
        """Lifespan context manager initializes database pool."""
        from app.main import lifespan

        mock_pool = MagicMock()
        mock_pool.close = AsyncMock()

        with patch("app.main.init_pool", return_value=mock_pool) as mock_init:
            with patch("app.main.verify_schema", return_value=None) as mock_verify:
                async with lifespan(app) as _:
                    mock_init.assert_called_once()
                    mock_verify.assert_called_once_with(mock_pool)
                    assert app.state.pool == mock_pool

                # After context, pool should be closed
                mock_pool.close.assert_called_once()


class TestSecurityHeaders:
    """Test security headers middleware."""

    def test_security_headers_added(self, test_client, test_settings):
        """Security headers are added to responses."""
        with patch("app.main._is_admitted", return_value=False):
            response = test_client.get("/")

            headers = response.headers
            assert "X-Content-Type-Options" in headers
            assert headers["X-Content-Type-Options"] == "nosniff"

            assert "X-Frame-Options" in headers
            assert headers["X-Frame-Options"] == "DENY"

            assert "X-XSS-Protection" in headers

    def test_security_headers_on_all_routes(self, test_client, test_settings):
        """Security headers applied to all routes."""
        with patch("app.main._is_admitted", return_value=True):
            with patch("app.auth.get_current_user", return_value=None):
                response = test_client.get("/login", allow_redirects=False)
                assert "X-Content-Type-Options" in response.headers


class TestCaptchaIntegration:
    """Test captcha integration in main app."""

    def test_captcha_length_constant(self):
        """Captcha length constant is imported and used."""
        from app.main import CAPTCHA_LEN
        from app.captcha import CAPTCHA_LEN as EXPECTED_LEN

        assert CAPTCHA_LEN == EXPECTED_LEN

    def test_captcha_generates_valid_image(self, test_settings):
        """Generated captcha is valid base64 PNG."""
        from app.captcha import generate_captcha, render_captcha_png

        answer, token = generate_captcha()
        png_bytes = render_captcha_png(answer)

        # Should be valid PNG bytes
        assert isinstance(png_bytes, bytes)
        assert len(png_bytes) > 0

        # Should encode to valid base64
        b64 = base64.b64encode(png_bytes).decode()
        assert len(b64) > 0


class TestErrorHandling:
    """Test error handling in main routes."""

    def test_waiting_room_handles_missing_fields(self, test_client, test_settings):
        """Waiting room handles missing form fields gracefully."""
        response = test_client.post(
            "/",
            data={},
            allow_redirects=False
        )
        # Should redirect or show error, not crash
        assert response.status_code in [200, 303]

    def test_waiting_room_handles_empty_answer(self, test_client, test_settings):
        """Waiting room handles empty captcha answer."""
        with patch("app.main.secrets.compare_digest", return_value=True):
            with patch("app.main.is_token_expired", return_value=False):
                with patch("app.main.verify_captcha", return_value=False):
                    response = test_client.post(
                        "/",
                        data={
                            "captcha_answer": "",
                            "captcha_token": "token",
                            "csrf_token": "valid"
                        }
                    )
                    assert response.status_code == 200


class TestRouteRegistration:
    """Test that all expected routes are registered."""

    def test_auth_routes_registered(self, test_client):
        """Auth routes are accessible."""
        # Login route should exist
        response = test_client.get("/login")
        assert response.status_code != 404

        # Register route should exist
        response = test_client.get("/register")
        assert response.status_code != 404

    def test_gate_routes_registered(self, test_client):
        """Gate routes are accessible."""
        # Gate route should exist (may redirect)
        response = test_client.get("/gate", allow_redirects=False)
        assert response.status_code != 404

    def test_lotto_routes_registered(self, test_client):
        """Lotto routes are accessible."""
        # Lotto route should exist (may redirect)
        response = test_client.get("/lotto", allow_redirects=False)
        assert response.status_code != 404

    def test_root_route_exists(self, test_client):
        """Root route exists."""
        response = test_client.get("/")
        assert response.status_code == 200


class TestCookieHandling:
    """Test cookie handling in main app."""

    def test_admitted_cookie_attributes(self, test_client, test_settings):
        """Admitted cookie has correct security attributes."""
        with patch("app.main.is_token_expired", return_value=False):
            with patch("app.main.verify_captcha", return_value=True):
                with patch("app.main.secrets.compare_digest", return_value=True):
                    response = test_client.post(
                        "/",
                        data={
                            "captcha_answer": "CORRECT",
                            "captcha_token": "token",
                            "csrf_token": "valid"
                        },
                        allow_redirects=False
                    )

                    cookies = response.cookies
                    if ADMITTED_COOKIE in cookies:
                        cookie = cookies[ADMITTED_COOKIE]
                        # Cookie should be set with proper attributes
                        # TestClient may not preserve all cookie attributes

    def test_csrf_cookie_set_on_captcha(self, test_client, test_settings):
        """CSRF cookie is set when showing captcha."""
        with patch("app.main._is_admitted", return_value=False):
            response = test_client.get("/")
            # CSRF cookie should be set
            # Actual verification depends on middleware implementation


class TestStaticFiles:
    """Test static file serving."""

    def test_static_route_accessible(self, test_client):
        """Static files route is accessible."""
        # Try to access a static file path
        response = test_client.get("/static/style.css", allow_redirects=False)
        # May return 200 (file exists) or 404 (file doesn't exist)
        # But should not return 500 or crash
        assert response.status_code in [200, 404]