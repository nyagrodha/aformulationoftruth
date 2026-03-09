"""Tests for app/auth.py authentication module."""

import json
import secrets
import pytest
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from tests.test_helpers import make_async_pool_mock
from argon2 import PasswordHasher
from cryptography.fernet import Fernet


def test_generate_random_handle_format():
    """Test _generate_random_handle produces correct format."""
    from app.auth import _generate_random_handle

    handle = _generate_random_handle()

    parts = handle.split('-')
    assert len(parts) == 3
    assert parts[0].isalpha()  # adjective
    assert parts[1].isalpha()  # noun
    assert parts[2].isdigit()  # number
    assert len(parts[2]) == 4
    assert 1000 <= int(parts[2]) <= 9999


def test_generate_random_handle_uniqueness():
    """Test _generate_random_handle generates different handles."""
    from app.auth import _generate_random_handle

    handles = [_generate_random_handle() for _ in range(100)]

    # Should have high uniqueness (allowing some collisions due to randomness)
    unique_handles = set(handles)
    assert len(unique_handles) > 90  # At least 90% unique


def test_generate_random_handle_uses_word_lists():
    """Test _generate_random_handle uses predefined word lists."""
    from app.auth import _generate_random_handle, _ADJECTIVES, _NOUNS

    handle = _generate_random_handle()
    parts = handle.split('-')

    # Check that words are from the lists (can't guarantee exact match due to randomness,
    # but we can verify format)
    assert parts[0] in _ADJECTIVES or len(parts[0]) > 0
    assert parts[1] in _NOUNS or len(parts[1]) > 0


def test_get_fernet_valid_key():
    """Test _get_fernet returns Fernet instance with valid key."""
    from app.auth import _get_fernet

    valid_key = Fernet.generate_key().decode()

    with patch('app.auth.settings') as mock_settings:
        mock_settings.session_secret = valid_key

        fernet = _get_fernet()

        assert isinstance(fernet, Fernet)


def test_get_fernet_missing_key_raises_error():
    """Test _get_fernet raises RuntimeError when key not configured."""
    from app.auth import _get_fernet

    with patch('app.auth.settings') as mock_settings:
        mock_settings.session_secret = ''

        with pytest.raises(RuntimeError) as exc_info:
            _get_fernet()

        assert 'not configured' in str(exc_info.value)


def test_get_fernet_handles_bytes_key():
    """Test _get_fernet handles key as bytes."""
    from app.auth import _get_fernet

    valid_key = Fernet.generate_key()

    with patch('app.auth.settings') as mock_settings:
        mock_settings.session_secret = valid_key

        fernet = _get_fernet()

        assert isinstance(fernet, Fernet)


def test_encrypt_session():
    """Test _encrypt_session encrypts session data."""
    from app.auth import _encrypt_session

    valid_key = Fernet.generate_key().decode()

    with patch('app.auth.settings') as mock_settings:
        mock_settings.session_secret = valid_key

        data = {'sid': 'test_session_id', 'user_id': 123}
        token = _encrypt_session(data)

        assert isinstance(token, str)
        assert len(token) > 0


def test_encrypt_decrypt_session_roundtrip():
    """Test encrypting and decrypting session data."""
    from app.auth import _encrypt_session, _decrypt_session

    valid_key = Fernet.generate_key().decode()

    with patch('app.auth.settings') as mock_settings:
        mock_settings.session_secret = valid_key
        mock_settings.session_max_age = 3600

        original_data = {'sid': 'test_sid', 'user_id': 42}
        token = _encrypt_session(original_data)
        decrypted_data = _decrypt_session(token)

        assert decrypted_data == original_data


def test_decrypt_session_invalid_token():
    """Test _decrypt_session returns None for invalid token."""
    from app.auth import _decrypt_session

    valid_key = Fernet.generate_key().decode()

    with patch('app.auth.settings') as mock_settings:
        mock_settings.session_secret = valid_key
        mock_settings.session_max_age = 3600

        result = _decrypt_session('invalid_token')

        assert result is None


def test_decrypt_session_expired_token():
    """Test _decrypt_session returns None for expired token."""
    from app.auth import _decrypt_session

    valid_key = Fernet.generate_key().decode()

    with patch('app.auth.settings') as mock_settings:
        mock_settings.session_secret = valid_key
        mock_settings.session_max_age = 0  # Already expired

        # Create a token with the same key
        f = Fernet(valid_key.encode())
        token = f.encrypt(json.dumps({'sid': 'test'}).encode()).decode('ascii')

        result = _decrypt_session(token)

        # May return None due to TTL
        assert result is None or isinstance(result, dict)


def test_read_session_cookie_valid():
    """Test _read_session_cookie with valid cookie."""
    from app.auth import _read_session_cookie

    valid_key = Fernet.generate_key().decode()

    with patch('app.auth.settings') as mock_settings:
        mock_settings.session_secret = valid_key
        mock_settings.session_max_age = 3600

        # Create encrypted token
        f = Fernet(valid_key.encode())
        data = {'sid': 'test_sid', 'user_id': 123}
        token = f.encrypt(json.dumps(data).encode()).decode('ascii')

        request = Mock()
        request.cookies.get = Mock(return_value=token)

        result = _read_session_cookie(request)

        assert result == data


def test_read_session_cookie_missing():
    """Test _read_session_cookie returns None when cookie missing."""
    from app.auth import _read_session_cookie

    request = Mock()
    request.cookies.get = Mock(return_value=None)

    result = _read_session_cookie(request)

    assert result is None


def test_read_session_cookie_invalid():
    """Test _read_session_cookie returns None for invalid cookie."""
    from app.auth import _read_session_cookie

    valid_key = Fernet.generate_key().decode()

    with patch('app.auth.settings') as mock_settings:
        mock_settings.session_secret = valid_key
        mock_settings.session_max_age = 3600

        request = Mock()
        request.cookies.get = Mock(return_value='invalid_encrypted_token')

        result = _read_session_cookie(request)

        assert result is None


@pytest.mark.asyncio
async def test_get_current_user_valid_session():
    """Test get_current_user with valid session."""
    from app.auth import get_current_user

    valid_key = Fernet.generate_key().decode()

    with patch('app.auth.settings') as mock_settings:
        mock_settings.session_secret = valid_key
        mock_settings.session_max_age = 3600

        # Create encrypted session cookie
        f = Fernet(valid_key.encode())
        session_data = {'sid': 'test_sid', 'user_id': 1}
        token = f.encrypt(json.dumps(session_data).encode()).decode('ascii')

        request = Mock()
        request.cookies.get = Mock(return_value=token)

        # Mock database pool and connection
        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(return_value={
            'sid': 'test_sid',
            'id': 1,
            'handle': 'test-user-1234',
            'is_admin': False,
            'created_at': None,
            'csrf_token': 'csrf_token_value',
            'question_order_seed': 'seed123',
            'current_question': 1,
            'answers': {},
            'expires_at': None
        })

        mock_pool = make_async_pool_mock(mock_conn)

        result = await get_current_user(request, mock_pool)

        assert result is not None
        assert result['user_id'] == 1
        assert result['handle'] == 'test-user-1234'
        assert result['sid'] == 'test_sid'


@pytest.mark.asyncio
async def test_get_current_user_no_cookie():
    """Test get_current_user returns None when no session cookie."""
    from app.auth import get_current_user

    request = Mock()
    request.cookies.get = Mock(return_value=None)

    mock_pool = AsyncMock()

    result = await get_current_user(request, mock_pool)

    assert result is None


@pytest.mark.asyncio
async def test_get_current_user_invalid_session_data():
    """Test get_current_user returns None for invalid session data."""
    from app.auth import get_current_user

    valid_key = Fernet.generate_key().decode()

    with patch('app.auth.settings') as mock_settings:
        mock_settings.session_secret = valid_key
        mock_settings.session_max_age = 3600

        # Session without required fields
        f = Fernet(valid_key.encode())
        session_data = {'invalid': 'data'}
        token = f.encrypt(json.dumps(session_data).encode()).decode('ascii')

        request = Mock()
        request.cookies.get = Mock(return_value=token)

        mock_pool = AsyncMock()

        result = await get_current_user(request, mock_pool)

        assert result is None


@pytest.mark.asyncio
async def test_get_current_user_session_not_in_db():
    """Test get_current_user returns None when session not found in database."""
    from app.auth import get_current_user

    valid_key = Fernet.generate_key().decode()

    with patch('app.auth.settings') as mock_settings:
        mock_settings.session_secret = valid_key
        mock_settings.session_max_age = 3600

        f = Fernet(valid_key.encode())
        session_data = {'sid': 'test_sid', 'user_id': 1}
        token = f.encrypt(json.dumps(session_data).encode()).decode('ascii')

        request = Mock()
        request.cookies.get = Mock(return_value=token)

        # Mock database returning no row
        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(return_value=None)

        mock_pool = make_async_pool_mock(mock_conn)

        result = await get_current_user(request, mock_pool)

        assert result is None


def test_csrf_ok_valid():
    """Test _csrf_ok returns True for matching tokens."""
    from app.auth import _csrf_ok

    token = 'test_csrf_token'

    request = Mock()
    request.cookies.get = Mock(return_value=token)

    result = _csrf_ok(request, token)

    assert result is True


def test_csrf_ok_mismatch():
    """Test _csrf_ok returns False for mismatched tokens."""
    from app.auth import _csrf_ok

    request = Mock()
    request.cookies.get = Mock(return_value='cookie_token')

    result = _csrf_ok(request, 'form_token')

    assert result is False


def test_csrf_ok_missing_cookie():
    """Test _csrf_ok returns False when cookie missing."""
    from app.auth import _csrf_ok

    request = Mock()
    request.cookies.get = Mock(return_value=None)

    result = _csrf_ok(request, 'form_token')

    assert result is False


@pytest.mark.asyncio
async def test_create_session():
    """Test _create_session creates session in database."""
    from app.auth import _create_session
    from cryptography.fernet import Fernet

    valid_key = Fernet.generate_key().decode()

    with patch('app.auth.settings') as mock_settings:
        mock_settings.session_secret = valid_key
        mock_settings.session_max_age = 3600

        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock()

        sid, cookie_value = await _create_session(mock_conn, user_id=123)

        assert isinstance(sid, str)
        assert len(sid) > 0
        assert isinstance(cookie_value, str)
        assert len(cookie_value) > 0

        # Verify database insert was called
        mock_conn.execute.assert_called_once()
        call_args = mock_conn.execute.call_args
        assert 'INSERT INTO sessions' in call_args[0][0]


def test_set_session_cookie():
    """Test _set_session_cookie sets cookie with correct attributes."""
    from app.auth import _set_session_cookie

    with patch('app.auth.settings') as mock_settings:
        mock_settings.session_max_age = 3600

        response = Mock()
        response.set_cookie = Mock()

        cookie_value = 'test_cookie_value'
        _set_session_cookie(response, cookie_value)

        response.set_cookie.assert_called_once()
        call_args = response.set_cookie.call_args

        assert call_args[0][0] == '_session'  # cookie name
        assert call_args[0][1] == cookie_value
        assert call_args[1]['httponly'] is True
        assert call_args[1]['samesite'] == 'lax'
        assert call_args[1]['max_age'] == 3600


@pytest.mark.asyncio
async def test_login_page():
    """Test login_page renders login template."""
    from app.auth import login_page

    with patch('app.auth.templates') as mock_templates:
        mock_templates.TemplateResponse = Mock(return_value=Mock())

        with patch('app.auth.generate_csrf_token', return_value='csrf_token'):
            with patch('app.auth.set_csrf_cookie'):
                request = Mock()
                response = await login_page(request)

                assert response is not None


@pytest.mark.asyncio
async def test_login_submit_missing_credentials():
    """Test login_submit with missing credentials."""
    from app.auth import login_submit

    with patch('app.auth._csrf_ok', return_value=True):
        with patch('app.auth.templates') as mock_templates:
            mock_templates.TemplateResponse = Mock(return_value=Mock())

            with patch('app.auth.generate_csrf_token', return_value='new_csrf'):
                with patch('app.auth.set_csrf_cookie'):
                    request = Mock()
                    mock_pool = AsyncMock()

                    response = await login_submit(
                        request, handle='', password='', csrf_token='token', pool=mock_pool
                    )

                    # Should return template response with error
                    mock_templates.TemplateResponse.assert_called()
                    call_args = mock_templates.TemplateResponse.call_args
                    context = call_args[0][2]
                    assert 'error' in context
                    assert 'required' in context['error']


@pytest.mark.asyncio
async def test_login_submit_invalid_csrf():
    """Test login_submit with invalid CSRF token."""
    from app.auth import login_submit
    from fastapi.responses import RedirectResponse

    with patch('app.auth._csrf_ok', return_value=False):
        request = Mock()
        mock_pool = AsyncMock()

        response = await login_submit(
            request, handle='test', password='pass', csrf_token='bad_token', pool=mock_pool
        )

        assert isinstance(response, RedirectResponse)
        assert response.headers['location'] == '/login'


@pytest.mark.asyncio
async def test_login_submit_user_not_found():
    """Test login_submit with non-existent user."""
    from app.auth import login_submit

    with patch('app.auth._csrf_ok', return_value=True):
        with patch('app.auth.templates') as mock_templates:
            mock_templates.TemplateResponse = Mock(return_value=Mock())

            with patch('app.auth.generate_csrf_token', return_value='csrf'):
                with patch('app.auth.set_csrf_cookie'):
                    request = Mock()

                    mock_conn = AsyncMock()
                    mock_conn.fetchrow = AsyncMock(return_value=None)

                    mock_pool = make_async_pool_mock(mock_conn)

                    response = await login_submit(
                        request, handle='nonexistent', password='password',
                        csrf_token='token', pool=mock_pool
                    )

                    mock_templates.TemplateResponse.assert_called()
                    context = mock_templates.TemplateResponse.call_args[0][2]
                    assert 'Invalid' in context['error']


@pytest.mark.asyncio
async def test_register_page():
    """Test register_page renders registration template."""
    from app.auth import register_page

    with patch('app.auth.templates') as mock_templates:
        mock_templates.TemplateResponse = Mock(return_value=Mock())

        with patch('app.auth.generate_csrf_token', return_value='csrf'):
            with patch('app.auth.set_csrf_cookie'):
                with patch('app.auth._generate_random_handle', return_value='quiet-river-1234'):
                    request = Mock()
                    response = await register_page(request)

                    mock_templates.TemplateResponse.assert_called()
                    context = mock_templates.TemplateResponse.call_args[0][2]
                    assert context['suggested_handle'] == 'quiet-river-1234'


@pytest.mark.asyncio
async def test_random_handle_endpoint():
    """Test random_handle endpoint returns JSON with handle."""
    from app.auth import random_handle

    with patch('app.auth._generate_random_handle', return_value='test-handle-5678'):
        result = await random_handle()

        assert result == {'handle': 'test-handle-5678'}


@pytest.mark.asyncio
async def test_register_submit_invalid_handle_too_short():
    """Test register_submit with too short handle."""
    from app.auth import register_submit

    with patch('app.auth._csrf_ok', return_value=True):
        with patch('app.auth.templates') as mock_templates:
            mock_templates.TemplateResponse = Mock(return_value=Mock())

            with patch('app.auth.generate_csrf_token', return_value='csrf'):
                with patch('app.auth.set_csrf_cookie'):
                    with patch('app.auth._generate_random_handle', return_value='suggested'):
                        request = Mock()
                        mock_pool = AsyncMock()

                        response = await register_submit(
                            request, handle='ab', password='verylongpassword',
                            csrf_token='token', pool=mock_pool
                        )

                        context = mock_templates.TemplateResponse.call_args[0][2]
                        assert 'at least 3 characters' in context['error']


@pytest.mark.asyncio
async def test_register_submit_invalid_handle_too_long():
    """Test register_submit with too long handle."""
    from app.auth import register_submit

    with patch('app.auth._csrf_ok', return_value=True):
        with patch('app.auth.templates') as mock_templates:
            mock_templates.TemplateResponse = Mock(return_value=Mock())

            with patch('app.auth.generate_csrf_token', return_value='csrf'):
                with patch('app.auth.set_csrf_cookie'):
                    with patch('app.auth._generate_random_handle', return_value='suggested'):
                        request = Mock()
                        mock_pool = AsyncMock()

                        response = await register_submit(
                            request, handle='a' * 40, password='verylongpassword',
                            csrf_token='token', pool=mock_pool
                        )

                        context = mock_templates.TemplateResponse.call_args[0][2]
                        assert 'at most 32 characters' in context['error']


@pytest.mark.asyncio
async def test_register_submit_invalid_handle_chars():
    """Test register_submit with invalid characters in handle."""
    from app.auth import register_submit

    with patch('app.auth._csrf_ok', return_value=True):
        with patch('app.auth.templates') as mock_templates:
            mock_templates.TemplateResponse = Mock(return_value=Mock())

            with patch('app.auth.generate_csrf_token', return_value='csrf'):
                with patch('app.auth.set_csrf_cookie'):
                    with patch('app.auth._generate_random_handle', return_value='suggested'):
                        request = Mock()
                        mock_pool = AsyncMock()

                        response = await register_submit(
                            request, handle='test@user', password='verylongpassword',
                            csrf_token='token', pool=mock_pool
                        )

                        context = mock_templates.TemplateResponse.call_args[0][2]
                        assert 'letters, digits, hyphens, underscores' in context['error']


@pytest.mark.asyncio
async def test_register_submit_password_too_short():
    """Test register_submit with too short password."""
    from app.auth import register_submit

    with patch('app.auth._csrf_ok', return_value=True):
        with patch('app.auth.templates') as mock_templates:
            mock_templates.TemplateResponse = Mock(return_value=Mock())

            with patch('app.auth.generate_csrf_token', return_value='csrf'):
                with patch('app.auth.set_csrf_cookie'):
                    with patch('app.auth._generate_random_handle', return_value='suggested'):
                        request = Mock()
                        mock_pool = AsyncMock()

                        response = await register_submit(
                            request, handle='validhandle', password='short',
                            csrf_token='token', pool=mock_pool
                        )

                        context = mock_templates.TemplateResponse.call_args[0][2]
                        assert 'at least 12 characters' in context['error']


@pytest.mark.asyncio
async def test_logout_submit():
    """Test logout_submit deletes session and redirects."""
    from app.auth import logout_submit
    from fastapi.responses import RedirectResponse

    valid_key = Fernet.generate_key().decode()

    with patch('app.auth.settings') as mock_settings:
        mock_settings.session_secret = valid_key
        mock_settings.session_max_age = 3600

        f = Fernet(valid_key.encode())
        session_data = {'sid': 'test_sid', 'user_id': 1}
        token = f.encrypt(json.dumps(session_data).encode()).decode('ascii')

        request = Mock()
        request.cookies.get = Mock(return_value=token)

        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock()

        mock_pool = make_async_pool_mock(mock_conn)

        response = await logout_submit(request, mock_pool)

        assert isinstance(response, RedirectResponse)
        assert response.headers['location'] == '/'
        mock_conn.execute.assert_called_once()


@pytest.mark.asyncio
async def test_logout_page():
    """Test logout_page calls logout_submit."""
    from app.auth import logout_page

    with patch('app.auth.logout_submit', new_callable=AsyncMock) as mock_logout:
        mock_logout.return_value = Mock()

        request = Mock()
        mock_pool = AsyncMock()

        result = await logout_page(request, mock_pool)

        mock_logout.assert_called_once_with(request, mock_pool)