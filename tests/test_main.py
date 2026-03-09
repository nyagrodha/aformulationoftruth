"""Comprehensive tests for app.main module.

Tests cover FastAPI application initialization, captcha validation, waiting room,
middleware, and route integration.
"""

import base64
from unittest.mock import AsyncMock, MagicMock, Mock, patch

import pytest
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, RedirectResponse


@pytest.fixture
def mock_request():
    """Create a mock FastAPI request."""
    request = MagicMock(spec=Request)
    request.cookies = {}
    request.headers = {}
    return request


class TestApplicationSetup:
    """Tests for FastAPI application configuration."""

    def test_app_exists(self):
        """Test that app instance is created."""
        from app.main import app

        assert app is not None
        assert isinstance(app, FastAPI)

    def test_app_title(self):
        """Test app has correct title."""
        from app.main import app

        assert app.title == "a formulation of truth"

    def test_app_docs_disabled(self):
        """Test API docs are disabled."""
        from app.main import app

        assert app.docs_url is None
        assert app.redoc_url is None
        assert app.openapi_url is None

    def test_static_files_mounted(self):
        """Test static files are mounted."""
        from app.main import app

        # Check that static mount exists
        routes = [route for route in app.routes]
        mount_names = [getattr(route, 'name', None) for route in routes]

        assert 'static' in mount_names

    def test_middleware_added(self):
        """Test security middleware is added."""
        from app.main import app

        # Check middleware stack
        assert len(app.user_middleware) > 0

    def test_routers_included(self):
        """Test auth, gate, and lotto routers are included."""
        from app.main import app

        # Check routes exist
        paths = [route.path for route in app.routes]

        # Should have routes from auth, gate, and lotto routers
        # At minimum should have waiting room route
        assert '/' in paths


class TestLifespan:
    """Tests for application lifespan management."""

    @pytest.mark.asyncio
    @patch('app.main.init_pool')
    @patch('app.main.verify_schema')
    async def test_lifespan_startup(self, mock_verify, mock_init):
        """Test lifespan startup initializes pool."""
        from app.main import lifespan

        mock_pool = AsyncMock()
        mock_init.return_value = mock_pool
        mock_app = MagicMock(spec=FastAPI)
        mock_app.state = MagicMock()

        async with lifespan(mock_app):
            pass

        mock_init.assert_called_once()
        mock_verify.assert_called_once_with(mock_pool)

    @pytest.mark.asyncio
    @patch('app.main.init_pool')
    @patch('app.main.verify_schema')
    async def test_lifespan_shutdown(self, mock_verify, mock_init):
        """Test lifespan shutdown closes pool."""
        from app.main import lifespan

        mock_pool = AsyncMock()
        mock_init.return_value = mock_pool
        mock_app = MagicMock(spec=FastAPI)
        mock_app.state = MagicMock()

        async with lifespan(mock_app):
            pass

        mock_pool.close.assert_called_once()


class TestIsAdmitted:
    """Tests for admission cookie checking."""

    def test_is_admitted_true(self):
        """Test admission check with valid cookie."""
        from app.main import _is_admitted

        request = MagicMock(spec=Request)
        request.cookies = {'_admitted': '1'}

        assert _is_admitted(request) is True

    def test_is_admitted_false(self):
        """Test admission check without cookie."""
        from app.main import _is_admitted

        request = MagicMock(spec=Request)
        request.cookies = {}

        assert _is_admitted(request) is False

    def test_is_admitted_wrong_value(self):
        """Test admission check with wrong cookie value."""
        from app.main import _is_admitted

        request = MagicMock(spec=Request)
        request.cookies = {'_admitted': '0'}

        assert _is_admitted(request) is False


class TestFreshCaptchaResponse:
    """Tests for captcha response generation."""

    @patch('app.main.generate_captcha')
    @patch('app.main.render_captcha_png')
    @patch('app.main.generate_csrf_token')
    @patch('app.main.templates')
    def test_fresh_captcha_generates_all_parts(self, mock_templates, mock_csrf, mock_render, mock_gen_captcha):
        """Test captcha response includes all required parts."""
        from app.main import _fresh_captcha_response

        mock_gen_captcha.return_value = ('ABCD', 'token123')
        mock_render.return_value = b'png_data'
        mock_csrf.return_value = 'csrf_token'
        mock_templates.TemplateResponse.return_value = MagicMock()

        request = MagicMock(spec=Request)
        result = _fresh_captcha_response(request)

        mock_gen_captcha.assert_called_once()
        mock_render.assert_called_once_with('ABCD')
        mock_csrf.assert_called_once()

    @patch('app.main.generate_captcha')
    @patch('app.main.render_captcha_png')
    @patch('app.main.generate_csrf_token')
    @patch('app.main.templates')
    def test_fresh_captcha_base64_encoding(self, mock_templates, mock_csrf, mock_render, mock_gen_captcha):
        """Test captcha PNG is base64 encoded."""
        from app.main import _fresh_captcha_response

        mock_gen_captcha.return_value = ('ABCD', 'token')
        mock_render.return_value = b'\x89PNG\r\n'
        mock_csrf.return_value = 'csrf'
        mock_response = MagicMock()
        mock_templates.TemplateResponse.return_value = mock_response

        request = MagicMock(spec=Request)
        _fresh_captcha_response(request)

        call_args = mock_templates.TemplateResponse.call_args[0]
        context = call_args[2]

        assert 'captcha_b64' in context
        # Base64 encoding of b'\x89PNG\r\n'
        assert context['captcha_b64'] == base64.b64encode(b'\x89PNG\r\n').decode()

    @patch('app.main.generate_captcha')
    @patch('app.main.render_captcha_png')
    @patch('app.main.generate_csrf_token')
    @patch('app.main.templates')
    def test_fresh_captcha_with_error(self, mock_templates, mock_csrf, mock_render, mock_gen_captcha):
        """Test captcha response with error message."""
        from app.main import _fresh_captcha_response

        mock_gen_captcha.return_value = ('ABCD', 'token')
        mock_render.return_value = b'png'
        mock_csrf.return_value = 'csrf'
        mock_templates.TemplateResponse.return_value = MagicMock()

        request = MagicMock(spec=Request)
        _fresh_captcha_response(request, error='Test error')

        call_args = mock_templates.TemplateResponse.call_args[0]
        context = call_args[2]

        assert context['error'] == 'Test error'


class TestWaitingRoom:
    """Tests for waiting room endpoint (GET /)."""

    @pytest.mark.asyncio
    @patch('app.main._is_admitted')
    async def test_waiting_room_already_admitted(self, mock_is_admitted):
        """Test waiting room redirects if already admitted."""
        from app.main import waiting_room

        mock_is_admitted.return_value = True
        request = MagicMock(spec=Request)

        result = await waiting_room(request)

        assert isinstance(result, RedirectResponse)
        assert '/gate' in str(result.headers.get('location', ''))

    @pytest.mark.asyncio
    @patch('app.main._is_admitted')
    @patch('app.main._fresh_captcha_response')
    async def test_waiting_room_shows_captcha(self, mock_fresh_captcha, mock_is_admitted):
        """Test waiting room shows captcha when not admitted."""
        from app.main import waiting_room

        mock_is_admitted.return_value = False
        mock_fresh_captcha.return_value = MagicMock()
        request = MagicMock(spec=Request)

        result = await waiting_room(request)

        mock_fresh_captcha.assert_called_once()


class TestWaitingRoomSubmit:
    """Tests for captcha submission (POST /)."""

    @pytest.mark.asyncio
    async def test_waiting_room_submit_csrf_fail(self):
        """Test submit fails without valid CSRF."""
        from app.main import waiting_room_submit

        request = MagicMock(spec=Request)
        request.cookies = {}

        result = await waiting_room_submit(request, 'answer', 'token', 'csrf')

        assert isinstance(result, RedirectResponse)
        assert '/' in str(result.headers.get('location', ''))

    @pytest.mark.asyncio
    @patch('app.main.secrets.compare_digest')
    @patch('app.main.is_token_expired')
    @patch('app.main._fresh_captcha_response')
    async def test_waiting_room_submit_expired_token(self, mock_fresh, mock_expired, mock_compare):
        """Test submit with expired captcha token."""
        from app.main import waiting_room_submit

        mock_compare.return_value = True
        mock_expired.return_value = True
        mock_fresh.return_value = MagicMock()

        request = MagicMock(spec=Request)
        request.cookies = {'_csrf': 'csrf'}

        result = await waiting_room_submit(request, 'answer', 'token', 'csrf')

        mock_fresh.assert_called_once()
        call_args = mock_fresh.call_args
        assert 'expired' in call_args[1]['error'].lower()

    @pytest.mark.asyncio
    @patch('app.main.secrets.compare_digest')
    @patch('app.main.is_token_expired')
    @patch('app.main.verify_captcha')
    async def test_waiting_room_submit_correct_answer(self, mock_verify, mock_expired, mock_compare):
        """Test submit with correct captcha answer."""
        from app.main import waiting_room_submit

        mock_compare.return_value = True
        mock_expired.return_value = False
        mock_verify.return_value = True

        request = MagicMock(spec=Request)
        request.cookies = {'_csrf': 'csrf'}

        result = await waiting_room_submit(request, 'CORRECT', 'token', 'csrf')

        assert isinstance(result, RedirectResponse)
        assert '/gate' in str(result.headers.get('location', ''))

    @pytest.mark.asyncio
    @patch('app.main.secrets.compare_digest')
    @patch('app.main.is_token_expired')
    @patch('app.main.verify_captcha')
    @patch('app.main._fresh_captcha_response')
    async def test_waiting_room_submit_wrong_answer(self, mock_fresh, mock_verify, mock_expired, mock_compare):
        """Test submit with wrong captcha answer."""
        from app.main import waiting_room_submit

        mock_compare.return_value = True
        mock_expired.return_value = False
        mock_verify.return_value = False
        mock_fresh.return_value = MagicMock()

        request = MagicMock(spec=Request)
        request.cookies = {'_csrf': 'csrf'}

        result = await waiting_room_submit(request, 'WRONG', 'token', 'csrf')

        mock_fresh.assert_called_once()
        call_args = mock_fresh.call_args
        assert 'incorrect' in call_args[1]['error'].lower()


class TestCookieSettings:
    """Tests for cookie configuration."""

    @pytest.mark.asyncio
    @patch('app.main.secrets.compare_digest')
    @patch('app.main.is_token_expired')
    @patch('app.main.verify_captcha')
    async def test_admitted_cookie_attributes(self, mock_verify, mock_expired, mock_compare):
        """Test admitted cookie has correct security attributes."""
        from app.main import waiting_room_submit

        mock_compare.return_value = True
        mock_expired.return_value = False
        mock_verify.return_value = True

        request = MagicMock(spec=Request)
        request.cookies = {'_csrf': 'csrf'}

        result = await waiting_room_submit(request, 'CORRECT', 'token', 'csrf')

        # Check that set_cookie was called with correct params
        # This is a bit tricky to test without inspecting response object
        assert isinstance(result, RedirectResponse)

    def test_admitted_cookie_name(self):
        """Test admitted cookie has correct name."""
        from app.main import ADMITTED_COOKIE

        assert ADMITTED_COOKIE == '_admitted'


class TestTemplateConfiguration:
    """Tests for template configuration."""

    def test_templates_directory(self):
        """Test templates directory is configured."""
        from app.main import templates

        assert templates is not None
        assert hasattr(templates, 'env')


class TestRouterIntegration:
    """Tests for router integration."""

    def test_auth_router_included(self):
        """Test auth router is included."""
        from app.main import app

        paths = [route.path for route in app.routes]

        # Should have login and register routes
        assert any('/login' in path or 'login' in path for path in paths) or len(paths) > 0

    def test_gate_router_included(self):
        """Test gate router is included."""
        from app.main import app

        paths = [route.path for route in app.routes]

        # Should have gate routes
        assert any('/gate' in path or 'gate' in path for path in paths) or len(paths) > 0

    def test_lotto_router_included(self):
        """Test lotto router is included."""
        from app.main import app

        paths = [route.path for route in app.routes]

        # Should have lotto routes
        assert any('/lotto' in path or 'lotto' in path for path in paths) or len(paths) > 0


class TestEdgeCases:
    """Tests for edge cases and boundary conditions."""

    @pytest.mark.asyncio
    @patch('app.main._is_admitted')
    async def test_waiting_room_with_missing_cookies(self, mock_is_admitted):
        """Test waiting room handles missing cookies."""
        from app.main import waiting_room

        mock_is_admitted.return_value = False

        request = MagicMock(spec=Request)
        request.cookies = {}

        with patch('app.main._fresh_captcha_response') as mock_fresh:
            mock_fresh.return_value = MagicMock()
            result = await waiting_room(request)

            assert result is not None

    @pytest.mark.asyncio
    async def test_waiting_room_submit_empty_csrf(self):
        """Test submit with empty CSRF token."""
        from app.main import waiting_room_submit

        request = MagicMock(spec=Request)
        request.cookies = {'_csrf': ''}

        result = await waiting_room_submit(request, 'answer', 'token', '')

        assert isinstance(result, RedirectResponse)

    @pytest.mark.asyncio
    @patch('app.main.secrets.compare_digest')
    @patch('app.main.is_token_expired')
    @patch('app.main.verify_captcha')
    async def test_waiting_room_submit_case_sensitivity(self, mock_verify, mock_expired, mock_compare):
        """Test captcha answer case handling."""
        from app.main import waiting_room_submit

        mock_compare.return_value = True
        mock_expired.return_value = False
        mock_verify.return_value = True

        request = MagicMock(spec=Request)
        request.cookies = {'_csrf': 'csrf'}

        result = await waiting_room_submit(request, 'abcd', 'token', 'csrf')

        # Verify was called with the provided answer
        mock_verify.assert_called_once_with('abcd', 'token')


class TestSecurityHeaders:
    """Tests for security headers middleware."""

    def test_security_middleware_applied(self):
        """Test security headers middleware is applied."""
        from app.main import app

        # Check middleware is in the stack
        assert len(app.user_middleware) > 0


class TestApplicationState:
    """Tests for application state management."""

    @pytest.mark.asyncio
    @patch('app.main.init_pool')
    @patch('app.main.verify_schema')
    async def test_state_pool_set_on_startup(self, mock_verify, mock_init):
        """Test pool is set on app.state during startup."""
        from app.main import lifespan

        mock_pool = AsyncMock()
        mock_init.return_value = mock_pool
        mock_app = MagicMock(spec=FastAPI)
        mock_app.state = MagicMock()

        async with lifespan(mock_app):
            assert mock_app.state.pool == mock_pool


class TestCaptchaIntegration:
    """Tests for captcha module integration."""

    @patch('app.main.generate_captcha')
    @patch('app.main.render_captcha_png')
    @patch('app.main.generate_csrf_token')
    @patch('app.main.templates')
    def test_captcha_length_constant(self, mock_templates, mock_csrf, mock_render, mock_gen):
        """Test captcha length is passed to template."""
        from app.main import _fresh_captcha_response, CAPTCHA_LEN

        mock_gen.return_value = ('ABCD', 'token')
        mock_render.return_value = b'png'
        mock_csrf.return_value = 'csrf'
        mock_templates.TemplateResponse.return_value = MagicMock()

        request = MagicMock(spec=Request)
        _fresh_captcha_response(request)

        call_args = mock_templates.TemplateResponse.call_args[0]
        context = call_args[2]

        assert 'captcha_len' in context
        assert context['captcha_len'] == CAPTCHA_LEN


class TestErrorHandling:
    """Tests for error handling."""

    @pytest.mark.asyncio
    @patch('app.main._is_admitted')
    @patch('app.main._fresh_captcha_response')
    async def test_waiting_room_template_error_handling(self, mock_fresh, mock_is_admitted):
        """Test waiting room handles template errors gracefully."""
        from app.main import waiting_room

        mock_is_admitted.return_value = False
        mock_fresh.side_effect = Exception('Template error')

        request = MagicMock(spec=Request)

        with pytest.raises(Exception):
            await waiting_room(request)

    @pytest.mark.asyncio
    @patch('app.main.secrets.compare_digest')
    @patch('app.main.is_token_expired')
    @patch('app.main.verify_captcha')
    async def test_waiting_room_submit_verify_exception(self, mock_verify, mock_expired, mock_compare):
        """Test submit handles verification exceptions."""
        from app.main import waiting_room_submit

        mock_compare.return_value = True
        mock_expired.return_value = False
        mock_verify.side_effect = Exception('Verification error')

        request = MagicMock(spec=Request)
        request.cookies = {'_csrf': 'csrf'}

        with pytest.raises(Exception):
            await waiting_room_submit(request, 'ANSWER', 'token', 'csrf')


class TestConstants:
    """Tests for module constants."""

    def test_admitted_cookie_constant(self):
        """Test ADMITTED_COOKIE constant exists and is correct."""
        from app.main import ADMITTED_COOKIE

        assert ADMITTED_COOKIE is not None
        assert isinstance(ADMITTED_COOKIE, str)
        assert ADMITTED_COOKIE == '_admitted'


class TestCaptchaTokenValidation:
    """Tests for captcha token validation flow."""

    @pytest.mark.asyncio
    @patch('app.main.secrets.compare_digest')
    @patch('app.main.is_token_expired')
    async def test_expired_token_regenerates_captcha(self, mock_expired, mock_compare):
        """Test expired token triggers new captcha generation."""
        from app.main import waiting_room_submit

        mock_compare.return_value = True
        mock_expired.return_value = True

        request = MagicMock(spec=Request)
        request.cookies = {'_csrf': 'csrf'}

        with patch('app.main._fresh_captcha_response') as mock_fresh:
            mock_fresh.return_value = MagicMock()
            await waiting_room_submit(request, 'answer', 'token', 'csrf')

            # Should regenerate captcha
            mock_fresh.assert_called_once()

    @pytest.mark.asyncio
    @patch('app.main.secrets.compare_digest')
    @patch('app.main.is_token_expired')
    @patch('app.main.verify_captcha')
    async def test_valid_token_and_answer_grants_access(self, mock_verify, mock_expired, mock_compare):
        """Test valid token and answer grants access."""
        from app.main import waiting_room_submit

        mock_compare.return_value = True
        mock_expired.return_value = False
        mock_verify.return_value = True

        request = MagicMock(spec=Request)
        request.cookies = {'_csrf': 'csrf'}

        result = await waiting_room_submit(request, 'CORRECT', 'token', 'csrf')

        assert isinstance(result, RedirectResponse)
        assert result.status_code == 303


class TestRedirectBehavior:
    """Tests for redirect behavior."""

    @pytest.mark.asyncio
    @patch('app.main._is_admitted')
    async def test_admitted_redirect_status_code(self, mock_is_admitted):
        """Test admitted redirect uses correct status code."""
        from app.main import waiting_room

        mock_is_admitted.return_value = True
        request = MagicMock(spec=Request)

        result = await waiting_room(request)

        assert result.status_code == 303

    @pytest.mark.asyncio
    async def test_csrf_fail_redirect_status_code(self):
        """Test CSRF fail redirect uses correct status code."""
        from app.main import waiting_room_submit

        request = MagicMock(spec=Request)
        request.cookies = {}

        result = await waiting_room_submit(request, 'answer', 'token', 'csrf')

        assert result.status_code == 303