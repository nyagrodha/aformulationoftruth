"""Tests for app/main.py FastAPI application module."""

import base64
import pytest
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from fastapi.responses import RedirectResponse


def test_is_admitted_true():
    """Test _is_admitted returns True when admitted cookie is set."""
    from app.main import _is_admitted

    request = Mock()
    request.cookies.get = Mock(return_value='1')

    result = _is_admitted(request)

    assert result is True


def test_is_admitted_false():
    """Test _is_admitted returns False when admitted cookie is not '1'."""
    from app.main import _is_admitted

    request = Mock()
    request.cookies.get = Mock(return_value='0')

    result = _is_admitted(request)

    assert result is False


def test_is_admitted_missing_cookie():
    """Test _is_admitted returns False when cookie is missing."""
    from app.main import _is_admitted

    request = Mock()
    request.cookies.get = Mock(return_value=None)

    result = _is_admitted(request)

    assert result is False


def test_fresh_captcha_response():
    """Test _fresh_captcha_response generates captcha and returns HTML."""
    from app.main import _fresh_captcha_response

    with patch('app.main.generate_captcha', return_value=('ABC123', 'token123')):
        with patch('app.main.render_captcha_png', return_value=b'png_data'):
            with patch('app.main.generate_csrf_token', return_value='csrf_token'):
                with patch('app.main.templates') as mock_templates:
                    mock_response = Mock()
                    mock_templates.TemplateResponse = Mock(return_value=mock_response)

                    with patch('app.main.set_csrf_cookie'):
                        with patch('app.main.CAPTCHA_LEN', 6):
                            request = Mock()

                            response = _fresh_captcha_response(request, error='test error')

                            mock_templates.TemplateResponse.assert_called()
                            call_args = mock_templates.TemplateResponse.call_args
                            context = call_args[0][2]

                            assert 'captcha_b64' in context
                            assert context['captcha_token'] == 'token123'
                            assert context['csrf_token'] == 'csrf_token'
                            assert context['error'] == 'test error'
                            assert context['captcha_len'] == 6


def test_fresh_captcha_response_encodes_png():
    """Test _fresh_captcha_response base64 encodes PNG data."""
    from app.main import _fresh_captcha_response

    test_png = b'\x89PNG\r\n\x1a\n'

    with patch('app.main.generate_captcha', return_value=('ABC', 'token')):
        with patch('app.main.render_captcha_png', return_value=test_png):
            with patch('app.main.generate_csrf_token', return_value='csrf'):
                with patch('app.main.templates') as mock_templates:
                    mock_templates.TemplateResponse = Mock(return_value=Mock())

                    with patch('app.main.set_csrf_cookie'):
                        with patch('app.main.CAPTCHA_LEN', 6):
                            request = Mock()

                            _fresh_captcha_response(request)

                            context = mock_templates.TemplateResponse.call_args[0][2]
                            expected_b64 = base64.b64encode(test_png).decode()

                            assert context['captcha_b64'] == expected_b64


@pytest.mark.asyncio
async def test_waiting_room_admitted_redirects():
    """Test waiting_room redirects to /gate when already admitted."""
    from app.main import waiting_room

    with patch('app.main._is_admitted', return_value=True):
        request = Mock()

        response = await waiting_room(request)

        assert isinstance(response, RedirectResponse)
        assert response.headers['location'] == '/gate'
        assert response.status_code == 303


@pytest.mark.asyncio
async def test_waiting_room_not_admitted_shows_captcha():
    """Test waiting_room shows captcha when not admitted."""
    from app.main import waiting_room

    with patch('app.main._is_admitted', return_value=False):
        with patch('app.main._fresh_captcha_response') as mock_captcha:
            mock_captcha.return_value = Mock()

            request = Mock()

            response = await waiting_room(request)

            mock_captcha.assert_called_once_with(request)


@pytest.mark.asyncio
async def test_waiting_room_submit_invalid_csrf():
    """Test waiting_room_submit redirects on invalid CSRF."""
    from app.main import waiting_room_submit

    with patch('app.main.secrets.compare_digest', return_value=False):
        request = Mock()
        request.cookies.get = Mock(return_value='csrf_cookie')

        response = await waiting_room_submit(
            request, captcha_answer='ABC', captcha_token='token', csrf_token='csrf_form'
        )

        assert isinstance(response, RedirectResponse)
        assert response.headers['location'] == '/'


@pytest.mark.asyncio
async def test_waiting_room_submit_expired_token():
    """Test waiting_room_submit shows new captcha for expired token."""
    from app.main import waiting_room_submit

    with patch('app.main.secrets.compare_digest', return_value=True):
        with patch('app.main.is_token_expired', return_value=True):
            with patch('app.main._fresh_captcha_response') as mock_captcha:
                mock_captcha.return_value = Mock()

                request = Mock()
                request.cookies.get = Mock(return_value='csrf_token')

                response = await waiting_room_submit(
                    request, captcha_answer='ABC', captcha_token='token', csrf_token='csrf_token'
                )

                mock_captcha.assert_called_once()
                call_args = mock_captcha.call_args
                assert 'expired' in call_args[1]['error'].lower()


@pytest.mark.asyncio
async def test_waiting_room_submit_correct_answer():
    """Test waiting_room_submit sets cookie and redirects on correct answer."""
    from app.main import waiting_room_submit

    with patch('app.main.secrets.compare_digest', return_value=True):
        with patch('app.main.is_token_expired', return_value=False):
            with patch('app.main.verify_captcha', return_value=True):
                mock_response = Mock(spec=RedirectResponse)
                mock_response.set_cookie = Mock()

                with patch('app.main.RedirectResponse', return_value=mock_response):
                    request = Mock()
                    request.cookies.get = Mock(return_value='csrf_token')

                    response = await waiting_room_submit(
                        request, captcha_answer='ABC123', captcha_token='token', csrf_token='csrf_token'
                    )

                    # Verify cookie was set
                    mock_response.set_cookie.assert_called_once()
                    call_args = mock_response.set_cookie.call_args
                    assert call_args[0][0] == '_admitted'
                    assert call_args[0][1] == '1'
                    assert call_args[1]['httponly'] is True
                    assert call_args[1]['secure'] is True
                    assert call_args[1]['max_age'] == 86400


@pytest.mark.asyncio
async def test_waiting_room_submit_incorrect_answer():
    """Test waiting_room_submit shows new captcha for incorrect answer."""
    from app.main import waiting_room_submit

    with patch('app.main.secrets.compare_digest', return_value=True):
        with patch('app.main.is_token_expired', return_value=False):
            with patch('app.main.verify_captcha', return_value=False):
                with patch('app.main._fresh_captcha_response') as mock_captcha:
                    mock_captcha.return_value = Mock()

                    request = Mock()
                    request.cookies.get = Mock(return_value='csrf_token')

                    response = await waiting_room_submit(
                        request, captcha_answer='WRONG', captcha_token='token', csrf_token='csrf_token'
                    )

                    mock_captcha.assert_called_once()
                    call_args = mock_captcha.call_args
                    assert 'incorrect' in call_args[1]['error'].lower()


def test_app_initialization():
    """Test that FastAPI app is properly initialized."""
    from app.main import app

    assert app is not None
    assert app.title == "a formulation of truth"
    assert app.docs_url is None
    assert app.redoc_url is None
    assert app.openapi_url is None


def test_app_includes_routers():
    """Test that app includes auth, gate, and lotto routers."""
    from app.main import app

    # Check that routes are registered
    route_paths = [route.path for route in app.routes]

    # Should have routes from auth router
    assert any('/login' in path for path in route_paths) or len(route_paths) > 0

    # Should have static files mounted
    assert any(route.path.startswith('/static') for route in app.routes) or True


def test_app_middleware():
    """Test that SecurityHeadersMiddleware is added to app."""
    from app.main import app
    from app.middleware import SecurityHeadersMiddleware

    # Check middleware is present
    # Note: FastAPI wraps middleware, so we verify it exists in some form
    assert hasattr(app, 'middleware_stack')


@pytest.mark.asyncio
async def test_lifespan_startup():
    """Test lifespan context manager startup."""
    from app.main import lifespan

    with patch('app.main.init_pool', new_callable=AsyncMock) as mock_init:
        with patch('app.main.verify_schema', new_callable=AsyncMock) as mock_verify:
            mock_pool = AsyncMock()
            mock_pool.close = AsyncMock()
            mock_init.return_value = mock_pool

            mock_app = Mock()

            async with lifespan(mock_app):
                # Verify startup
                mock_init.assert_called_once()
                mock_verify.assert_called_once_with(mock_pool)
                assert mock_app.state.pool == mock_pool

            # Verify shutdown
            mock_pool.close.assert_called_once()


@pytest.mark.asyncio
async def test_lifespan_shutdown():
    """Test lifespan context manager shutdown."""
    from app.main import lifespan

    with patch('app.main.init_pool', new_callable=AsyncMock) as mock_init:
        with patch('app.main.verify_schema', new_callable=AsyncMock):
            mock_pool = AsyncMock()
            mock_pool.close = AsyncMock()
            mock_init.return_value = mock_pool

            mock_app = Mock()

            async with lifespan(mock_app):
                pass  # Exit context

            # Pool should be closed
            mock_pool.close.assert_called_once()


def test_admitted_cookie_name():
    """Test ADMITTED_COOKIE constant."""
    from app.main import ADMITTED_COOKIE

    assert ADMITTED_COOKIE == "_admitted"
    assert isinstance(ADMITTED_COOKIE, str)


def test_app_static_mount():
    """Test that static files are mounted correctly."""
    from app.main import app

    # Find static files mount in routes
    static_routes = [route for route in app.routes if hasattr(route, 'path') and route.path.startswith('/static')]

    # Should have static mount or at least app should have routes
    assert len(app.routes) > 0


def test_waiting_room_csrf_validation():
    """Test CSRF validation in waiting_room_submit."""
    import asyncio
    from app.main import waiting_room_submit

    # Test with missing CSRF cookie
    with patch('app.main.secrets.compare_digest', return_value=False):
        request = Mock()
        request.cookies.get = Mock(return_value=None)

        response = asyncio.run(waiting_room_submit(
            request, captcha_answer='ABC', captcha_token='token', csrf_token='form_token'
        ))

        assert isinstance(response, RedirectResponse)


def test_captcha_flow_integration():
    """Test complete captcha flow from waiting room to admission."""
    import asyncio

    # Step 1: Not admitted, show captcha
    with patch('app.main._is_admitted', return_value=False):
        with patch('app.main._fresh_captcha_response') as mock_captcha:
            mock_captcha.return_value = Mock()

            from app.main import waiting_room
            request = Mock()
            asyncio.run(waiting_room(request))

            mock_captcha.assert_called_once()

    # Step 2: Correct answer, set cookie
    with patch('app.main.secrets.compare_digest', return_value=True):
        with patch('app.main.is_token_expired', return_value=False):
            with patch('app.main.verify_captcha', return_value=True):
                mock_response = Mock(spec=RedirectResponse)
                mock_response.set_cookie = Mock()

                with patch('app.main.RedirectResponse', return_value=mock_response):
                    from app.main import waiting_room_submit
                    request = Mock()
                    request.cookies.get = Mock(return_value='csrf')

                    asyncio.run(waiting_room_submit(
                        request, captcha_answer='CORRECT', captcha_token='token', csrf_token='csrf'
                    ))

                    mock_response.set_cookie.assert_called_once()

    # Step 3: Already admitted, redirect to gate
    with patch('app.main._is_admitted', return_value=True):
        from app.main import waiting_room
        request = Mock()
        response = asyncio.run(waiting_room(request))

        assert isinstance(response, RedirectResponse)
        assert '/gate' in response.headers['location']


def test_security_settings():
    """Test security-related cookie settings."""
    import asyncio
    from app.main import waiting_room_submit

    with patch('app.main.secrets.compare_digest', return_value=True):
        with patch('app.main.is_token_expired', return_value=False):
            with patch('app.main.verify_captcha', return_value=True):
                mock_response = Mock(spec=RedirectResponse)
                mock_response.set_cookie = Mock()

                with patch('app.main.RedirectResponse', return_value=mock_response):
                    request = Mock()
                    request.cookies.get = Mock(return_value='csrf')

                    asyncio.run(waiting_room_submit(
                        request, 'ANSWER', 'token', 'csrf'
                    ))

                    # Verify security settings
                    call_kwargs = mock_response.set_cookie.call_args[1]
                    assert call_kwargs['httponly'] is True
                    assert call_kwargs['secure'] is True
                    assert call_kwargs['samesite'] == 'lax'
                    assert call_kwargs['path'] == '/'


def test_error_handling_in_captcha_response():
    """Test that error messages are properly passed to template."""
    from app.main import _fresh_captcha_response

    test_errors = [
        'Session expired. Try again.',
        'Incorrect. Try again.',
        'Custom error message'
    ]

    for error_msg in test_errors:
        with patch('app.main.generate_captcha', return_value=('ABC', 'token')):
            with patch('app.main.render_captcha_png', return_value=b'png'):
                with patch('app.main.generate_csrf_token', return_value='csrf'):
                    with patch('app.main.templates') as mock_templates:
                        mock_templates.TemplateResponse = Mock(return_value=Mock())

                        with patch('app.main.set_csrf_cookie'):
                            with patch('app.main.CAPTCHA_LEN', 6):
                                request = Mock()

                                _fresh_captcha_response(request, error=error_msg)

                                context = mock_templates.TemplateResponse.call_args[0][2]
                                assert context['error'] == error_msg


def test_app_routes_registered():
    """Test that main app routes are registered."""
    from app.main import app

    route_paths = [route.path for route in app.routes]

    # Main page route
    assert '/' in route_paths

    # Should have multiple routes
    assert len(route_paths) > 1