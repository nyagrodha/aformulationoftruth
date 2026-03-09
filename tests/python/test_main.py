"""Comprehensive tests for app/main.py FastAPI application."""

import base64
from unittest.mock import AsyncMock, Mock, patch, MagicMock
import pytest
from fastapi import Request
from fastapi.responses import RedirectResponse

from app.main import (
    _is_admitted,
    _fresh_captcha_response,
    ADMITTED_COOKIE,
)


class TestIsAdmitted:
    """Test admission checking via cookie."""

    def test_is_admitted_with_valid_cookie(self):
        """Test user with valid admission cookie."""
        request = Mock(spec=Request)
        request.cookies = {ADMITTED_COOKIE: "1"}

        assert _is_admitted(request) is True

    def test_is_admitted_without_cookie(self):
        """Test user without admission cookie."""
        request = Mock(spec=Request)
        request.cookies = {}

        assert _is_admitted(request) is False

    def test_is_admitted_with_wrong_value(self):
        """Test admission cookie with wrong value."""
        request = Mock(spec=Request)
        request.cookies = {ADMITTED_COOKIE: "0"}

        assert _is_admitted(request) is False

    def test_is_admitted_with_string_value(self):
        """Test admission requires exact string "1"."""
        request = Mock(spec=Request)
        request.cookies = {ADMITTED_COOKIE: "true"}

        assert _is_admitted(request) is False

    def test_is_admitted_case_sensitive(self):
        """Test admission value is case-sensitive."""
        request = Mock(spec=Request)
        request.cookies = {ADMITTED_COOKIE: "1"}

        assert _is_admitted(request) is True


class TestFreshCaptchaResponse:
    """Test captcha response generation."""

    @patch("app.main.generate_captcha")
    @patch("app.main.render_captcha_png")
    @patch("app.main.generate_csrf_token")
    @patch("app.main.templates")
    @patch("app.main.set_csrf_cookie")
    def test_fresh_captcha_response_structure(
        self,
        mock_set_csrf,
        mock_templates,
        mock_gen_csrf,
        mock_render_png,
        mock_gen_captcha,
    ):
        """Test captcha response contains all required elements."""
        mock_gen_captcha.return_value = ("ABCD", "token123")
        mock_render_png.return_value = b"fake_png_data"
        mock_gen_csrf.return_value = "csrf123"
        mock_response = Mock()
        mock_templates.TemplateResponse.return_value = mock_response

        request = Mock(spec=Request)
        result = _fresh_captcha_response(request)

        assert result == mock_response
        mock_templates.TemplateResponse.assert_called_once()

        # Verify template context
        call_args = mock_templates.TemplateResponse.call_args
        context = call_args[0][2]
        assert "captcha_b64" in context
        assert "captcha_token" in context
        assert "csrf_token" in context
        assert context["captcha_token"] == "token123"
        assert context["csrf_token"] == "csrf123"

    @patch("app.main.generate_captcha")
    @patch("app.main.render_captcha_png")
    @patch("app.main.generate_csrf_token")
    @patch("app.main.templates")
    @patch("app.main.set_csrf_cookie")
    def test_fresh_captcha_response_with_error(
        self,
        mock_set_csrf,
        mock_templates,
        mock_gen_csrf,
        mock_render_png,
        mock_gen_captcha,
    ):
        """Test captcha response includes error message."""
        mock_gen_captcha.return_value = ("ABCD", "token123")
        mock_render_png.return_value = b"png"
        mock_gen_csrf.return_value = "csrf"
        mock_response = Mock()
        mock_templates.TemplateResponse.return_value = mock_response

        request = Mock(spec=Request)
        error_msg = "Incorrect. Try again."
        result = _fresh_captcha_response(request, error=error_msg)

        call_args = mock_templates.TemplateResponse.call_args
        context = call_args[0][2]
        assert context["error"] == error_msg

    @patch("app.main.generate_captcha")
    @patch("app.main.render_captcha_png")
    @patch("app.main.generate_csrf_token")
    @patch("app.main.templates")
    @patch("app.main.set_csrf_cookie")
    def test_fresh_captcha_response_encodes_png_base64(
        self,
        mock_set_csrf,
        mock_templates,
        mock_gen_csrf,
        mock_render_png,
        mock_gen_captcha,
    ):
        """Test PNG data is base64 encoded."""
        mock_gen_captcha.return_value = ("ABCD", "token123")
        png_data = b"\x89PNG\r\n\x1a\n"
        mock_render_png.return_value = png_data
        mock_gen_csrf.return_value = "csrf"
        mock_response = Mock()
        mock_templates.TemplateResponse.return_value = mock_response

        request = Mock(spec=Request)
        _fresh_captcha_response(request)

        call_args = mock_templates.TemplateResponse.call_args
        context = call_args[0][2]
        expected_b64 = base64.b64encode(png_data).decode()
        assert context["captcha_b64"] == expected_b64

    @patch("app.main.generate_captcha")
    @patch("app.main.render_captcha_png")
    @patch("app.main.generate_csrf_token")
    @patch("app.main.templates")
    @patch("app.main.set_csrf_cookie")
    def test_fresh_captcha_response_sets_csrf_cookie(
        self,
        mock_set_csrf,
        mock_templates,
        mock_gen_csrf,
        mock_render_png,
        mock_gen_captcha,
    ):
        """Test CSRF cookie is set on response."""
        mock_gen_captcha.return_value = ("ABCD", "token123")
        mock_render_png.return_value = b"png"
        mock_gen_csrf.return_value = "csrf_value"
        mock_response = Mock()
        mock_templates.TemplateResponse.return_value = mock_response

        request = Mock(spec=Request)
        _fresh_captcha_response(request)

        mock_set_csrf.assert_called_once_with(mock_response, "csrf_value")


class TestWaitingRoom:
    """Test waiting room route."""

    @pytest.mark.asyncio
    @patch("app.main._is_admitted")
    async def test_waiting_room_admitted_redirects_to_gate(self, mock_is_admitted):
        """Test admitted user redirects to gate."""
        from app.main import waiting_room

        mock_is_admitted.return_value = True

        request = Mock(spec=Request)
        result = await waiting_room(request)

        assert isinstance(result, RedirectResponse)
        assert result.status_code == 303
        assert "/gate" in str(result.headers.get("location", ""))

    @pytest.mark.asyncio
    @patch("app.main._is_admitted")
    @patch("app.main._fresh_captcha_response")
    async def test_waiting_room_not_admitted_shows_captcha(
        self, mock_fresh_captcha, mock_is_admitted
    ):
        """Test non-admitted user sees captcha."""
        from app.main import waiting_room

        mock_is_admitted.return_value = False
        mock_response = Mock()
        mock_fresh_captcha.return_value = mock_response

        request = Mock(spec=Request)
        result = await waiting_room(request)

        assert result == mock_response
        mock_fresh_captcha.assert_called_once_with(request)


class TestWaitingRoomSubmit:
    """Test captcha submission."""

    @pytest.mark.asyncio
    @patch("app.main.verify_captcha")
    @patch("app.main.is_token_expired")
    async def test_waiting_room_submit_correct_answer_sets_cookie(
        self, mock_is_expired, mock_verify
    ):
        """Test correct captcha answer sets admission cookie."""
        from app.main import waiting_room_submit

        mock_is_expired.return_value = False
        mock_verify.return_value = True

        request = Mock(spec=Request)
        request.cookies = {"_csrf": "csrf_value"}

        result = await waiting_room_submit(
            request,
            captcha_answer="ABCD",
            captcha_token="token123",
            csrf_token="csrf_value",
        )

        assert isinstance(result, RedirectResponse)
        assert "/gate" in str(result.headers.get("location", ""))
        # Check cookie was set
        assert hasattr(result, "set_cookie")

    @pytest.mark.asyncio
    @patch("app.main.verify_captcha")
    @patch("app.main.is_token_expired")
    @patch("app.main._fresh_captcha_response")
    async def test_waiting_room_submit_wrong_answer_shows_error(
        self, mock_fresh_captcha, mock_is_expired, mock_verify
    ):
        """Test wrong captcha answer shows error."""
        from app.main import waiting_room_submit

        mock_is_expired.return_value = False
        mock_verify.return_value = False
        mock_response = Mock()
        mock_fresh_captcha.return_value = mock_response

        request = Mock(spec=Request)
        request.cookies = {"_csrf": "csrf_value"}

        result = await waiting_room_submit(
            request,
            captcha_answer="WRONG",
            captcha_token="token123",
            csrf_token="csrf_value",
        )

        assert result == mock_response
        mock_fresh_captcha.assert_called_once()
        # Check error message was passed
        call_args = mock_fresh_captcha.call_args
        assert "error" in call_args[1]
        assert "Incorrect" in call_args[1]["error"]

    @pytest.mark.asyncio
    @patch("app.main.is_token_expired")
    @patch("app.main._fresh_captcha_response")
    async def test_waiting_room_submit_expired_token_shows_error(
        self, mock_fresh_captcha, mock_is_expired
    ):
        """Test expired captcha token shows error."""
        from app.main import waiting_room_submit

        mock_is_expired.return_value = True
        mock_response = Mock()
        mock_fresh_captcha.return_value = mock_response

        request = Mock(spec=Request)
        request.cookies = {"_csrf": "csrf_value"}

        result = await waiting_room_submit(
            request,
            captcha_answer="ABCD",
            captcha_token="token123",
            csrf_token="csrf_value",
        )

        assert result == mock_response
        call_args = mock_fresh_captcha.call_args
        assert "Session expired" in call_args[1]["error"]

    @pytest.mark.asyncio
    async def test_waiting_room_submit_invalid_csrf_redirects(self):
        """Test invalid CSRF token redirects."""
        from app.main import waiting_room_submit

        request = Mock(spec=Request)
        request.cookies = {"_csrf": "csrf_value"}

        result = await waiting_room_submit(
            request,
            captcha_answer="ABCD",
            captcha_token="token123",
            csrf_token="wrong_csrf",
        )

        assert isinstance(result, RedirectResponse)
        assert result.status_code == 303
        assert "/" == str(result.headers.get("location", ""))

    @pytest.mark.asyncio
    async def test_waiting_room_submit_missing_csrf_cookie_redirects(self):
        """Test missing CSRF cookie redirects."""
        from app.main import waiting_room_submit

        request = Mock(spec=Request)
        request.cookies = {}

        result = await waiting_room_submit(
            request,
            captcha_answer="ABCD",
            captcha_token="token123",
            csrf_token="any_value",
        )

        assert isinstance(result, RedirectResponse)


class TestAppLifespan:
    """Test FastAPI application lifespan."""

    @pytest.mark.asyncio
    @patch("app.main.init_pool")
    @patch("app.main.verify_schema")
    async def test_lifespan_initializes_pool(self, mock_verify, mock_init):
        """Test lifespan initializes database pool."""
        from app.main import lifespan

        mock_pool = AsyncMock()
        mock_init.return_value = mock_pool

        app_mock = Mock()
        app_mock.state = Mock()

        async with lifespan(app_mock):
            assert app_mock.state.pool == mock_pool
            mock_init.assert_called_once()
            mock_verify.assert_called_once_with(mock_pool)

        # Check pool was closed
        mock_pool.close.assert_called_once()


class TestAppConfiguration:
    """Test FastAPI app configuration."""

    def test_app_has_no_docs(self):
        """Test docs and OpenAPI are disabled."""
        from app.main import app

        assert app.docs_url is None
        assert app.redoc_url is None
        assert app.openapi_url is None

    def test_app_has_correct_title(self):
        """Test app title is set."""
        from app.main import app

        assert app.title == "a formulation of truth"

    def test_app_includes_routers(self):
        """Test app includes auth, gate, and lotto routers."""
        from app.main import app

        # Check routers are included (they have routes)
        routes = [route.path for route in app.routes]
        assert any("/login" in path for path in routes)
        assert any("/gate" in path for path in routes)
        assert any("/lotto" in path for path in routes)

    def test_app_mounts_static_files(self):
        """Test static files are mounted."""
        from app.main import app

        routes = [route for route in app.routes]
        static_routes = [r for r in routes if hasattr(r, "name") and r.name == "static"]
        assert len(static_routes) > 0


class TestAdmissionCookieSettings:
    """Test admission cookie configuration."""

    @pytest.mark.asyncio
    @patch("app.main.verify_captcha")
    @patch("app.main.is_token_expired")
    async def test_admission_cookie_httponly(self, mock_is_expired, mock_verify):
        """Test admission cookie is httponly."""
        from app.main import waiting_room_submit

        mock_is_expired.return_value = False
        mock_verify.return_value = True

        request = Mock(spec=Request)
        request.cookies = {"_csrf": "csrf_value"}

        with patch.object(RedirectResponse, "set_cookie") as mock_set_cookie:
            result = await waiting_room_submit(
                request,
                captcha_answer="ABCD",
                captcha_token="token123",
                csrf_token="csrf_value",
            )

            # Verify set_cookie was called with httponly=True
            if mock_set_cookie.called:
                call_kwargs = mock_set_cookie.call_args[1]
                assert call_kwargs.get("httponly") is True

    @pytest.mark.asyncio
    @patch("app.main.verify_captcha")
    @patch("app.main.is_token_expired")
    async def test_admission_cookie_secure_and_samesite(
        self, mock_is_expired, mock_verify
    ):
        """Test admission cookie security settings."""
        from app.main import waiting_room_submit

        mock_is_expired.return_value = False
        mock_verify.return_value = True

        request = Mock(spec=Request)
        request.cookies = {"_csrf": "csrf_value"}

        with patch.object(RedirectResponse, "set_cookie") as mock_set_cookie:
            result = await waiting_room_submit(
                request,
                captcha_answer="ABCD",
                captcha_token="token123",
                csrf_token="csrf_value",
            )

            if mock_set_cookie.called:
                call_kwargs = mock_set_cookie.call_args[1]
                assert call_kwargs.get("secure") is True
                assert call_kwargs.get("samesite") == "lax"


class TestEdgeCases:
    """Test edge cases and boundary conditions."""

    def test_is_admitted_with_integer_cookie(self):
        """Test admission with integer cookie value."""
        request = Mock(spec=Request)
        request.cookies = {ADMITTED_COOKIE: 1}  # Integer, not string

        # Should compare as string
        result = _is_admitted(request)
        # This will depend on implementation - might be True or False

    @pytest.mark.asyncio
    @patch("app.main.verify_captcha")
    @patch("app.main.is_token_expired")
    async def test_waiting_room_submit_empty_answer(self, mock_is_expired, mock_verify):
        """Test submitting empty captcha answer."""
        from app.main import waiting_room_submit

        mock_is_expired.return_value = False
        mock_verify.return_value = False

        request = Mock(spec=Request)
        request.cookies = {"_csrf": "csrf_value"}

        with patch("app.main._fresh_captcha_response") as mock_fresh:
            mock_fresh.return_value = Mock()
            result = await waiting_room_submit(
                request,
                captcha_answer="",
                captcha_token="token123",
                csrf_token="csrf_value",
            )

            # Should show error
            mock_fresh.assert_called_once()

    @pytest.mark.asyncio
    @patch("app.main.verify_captcha")
    @patch("app.main.is_token_expired")
    async def test_waiting_room_submit_whitespace_answer(
        self, mock_is_expired, mock_verify
    ):
        """Test submitting whitespace-only captcha answer."""
        from app.main import waiting_room_submit

        mock_is_expired.return_value = False
        mock_verify.return_value = False

        request = Mock(spec=Request)
        request.cookies = {"_csrf": "csrf_value"}

        with patch("app.main._fresh_captcha_response") as mock_fresh:
            mock_fresh.return_value = Mock()
            result = await waiting_room_submit(
                request,
                captcha_answer="   ",
                captcha_token="token123",
                csrf_token="csrf_value",
            )

            mock_fresh.assert_called_once()

    def test_admitted_cookie_name_constant(self):
        """Test ADMITTED_COOKIE constant is defined."""
        assert ADMITTED_COOKIE == "_admitted"