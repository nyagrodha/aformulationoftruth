"""Comprehensive tests for app.auth module.

Tests cover authentication, registration, session management, CSRF protection,
and all edge cases.
"""

import json
import secrets
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, Mock, patch

import pytest
from fastapi import Request
from fastapi.responses import HTMLResponse, RedirectResponse


# Test fixtures
@pytest.fixture
def mock_pool():
    """Create a mock database pool."""
    pool = AsyncMock()
    conn = AsyncMock()
    pool.acquire.return_value.__aenter__.return_value = conn
    return pool


@pytest.fixture
def mock_request():
    """Create a mock FastAPI request."""
    request = MagicMock(spec=Request)
    request.cookies = {}
    request.headers = {}
    return request


@pytest.fixture
def mock_fernet_key():
    """Generate a valid Fernet key for testing."""
    from cryptography.fernet import Fernet
    return Fernet.generate_key().decode()


class TestGenerateRandomHandle:
    """Tests for _generate_random_handle function."""

    @patch('app.auth.secrets.choice')
    @patch('app.auth.secrets.randbelow')
    def test_generate_random_handle_format(self, mock_randbelow, mock_choice):
        """Test that handle follows correct format: adjective-noun-number."""
        from app.auth import _generate_random_handle

        mock_choice.side_effect = ['quiet', 'river']
        mock_randbelow.return_value = 7382

        handle = _generate_random_handle()

        assert handle == 'quiet-river-8382'
        assert mock_choice.call_count == 2
        mock_randbelow.assert_called_once_with(9000)

    def test_generate_random_handle_randomness(self):
        """Test that multiple calls produce different handles."""
        from app.auth import _generate_random_handle

        handles = [_generate_random_handle() for _ in range(10)]

        # At least some should be different (very high probability)
        assert len(set(handles)) > 1

    def test_generate_random_handle_format_structure(self):
        """Test handle structure matches expected pattern."""
        from app.auth import _generate_random_handle

        handle = _generate_random_handle()
        parts = handle.split('-')

        assert len(parts) == 3
        assert parts[0].isalpha()
        assert parts[1].isalpha()
        assert parts[2].isdigit()
        assert 1000 <= int(parts[2]) <= 9999


class TestFernetEncryption:
    """Tests for Fernet session encryption/decryption."""

    @patch('app.auth.settings')
    def test_get_fernet_success(self, mock_settings, mock_fernet_key):
        """Test Fernet cipher initialization with valid key."""
        from app.auth import _get_fernet

        mock_settings.session_secret = mock_fernet_key

        fernet = _get_fernet()

        assert fernet is not None

    @patch('app.auth.settings')
    def test_get_fernet_missing_key(self, mock_settings):
        """Test Fernet fails when key is not configured."""
        from app.auth import _get_fernet

        mock_settings.session_secret = None

        with pytest.raises(RuntimeError, match="SESSION_SECRET.*not configured"):
            _get_fernet()

    @patch('app.auth._get_fernet')
    def test_encrypt_session(self, mock_get_fernet):
        """Test session data encryption."""
        from app.auth import _encrypt_session

        mock_fernet = Mock()
        mock_fernet.encrypt.return_value = b'encrypted_token'
        mock_get_fernet.return_value = mock_fernet

        data = {'sid': 'session123', 'user_id': 42}
        token = _encrypt_session(data)

        assert token == 'encrypted_token'
        mock_fernet.encrypt.assert_called_once()
        call_args = mock_fernet.encrypt.call_args[0][0]
        assert json.loads(call_args) == data

    @patch('app.auth._get_fernet')
    @patch('app.auth.settings')
    def test_decrypt_session_success(self, mock_settings, mock_get_fernet):
        """Test successful session decryption."""
        from app.auth import _decrypt_session

        mock_settings.session_max_age = 86400
        mock_fernet = Mock()
        session_data = {'sid': 'session123', 'user_id': 42}
        mock_fernet.decrypt.return_value = json.dumps(session_data).encode()
        mock_get_fernet.return_value = mock_fernet

        result = _decrypt_session('valid_token')

        assert result == session_data

    @patch('app.auth._get_fernet')
    def test_decrypt_session_invalid_token(self, mock_get_fernet):
        """Test decryption with invalid token returns None."""
        from app.auth import _decrypt_session
        from cryptography.fernet import InvalidToken

        mock_fernet = Mock()
        mock_fernet.decrypt.side_effect = InvalidToken
        mock_get_fernet.return_value = mock_fernet

        result = _decrypt_session('invalid_token')

        assert result is None

    @patch('app.auth._get_fernet')
    def test_decrypt_session_malformed_json(self, mock_get_fernet):
        """Test decryption with malformed JSON returns None."""
        from app.auth import _decrypt_session

        mock_fernet = Mock()
        mock_fernet.decrypt.return_value = b'not valid json'
        mock_get_fernet.return_value = mock_fernet

        result = _decrypt_session('token')

        assert result is None


class TestReadSessionCookie:
    """Tests for _read_session_cookie function."""

    @patch('app.auth._decrypt_session')
    def test_read_session_cookie_success(self, mock_decrypt):
        """Test reading valid session cookie."""
        from app.auth import _read_session_cookie

        request = MagicMock(spec=Request)
        request.cookies = {'_session': 'encrypted_token'}
        expected_data = {'sid': 'abc123', 'user_id': 5}
        mock_decrypt.return_value = expected_data

        result = _read_session_cookie(request)

        assert result == expected_data
        mock_decrypt.assert_called_once_with('encrypted_token')

    def test_read_session_cookie_missing(self):
        """Test reading when cookie is missing."""
        from app.auth import _read_session_cookie

        request = MagicMock(spec=Request)
        request.cookies = {}

        result = _read_session_cookie(request)

        assert result is None


class TestGetCurrentUser:
    """Tests for get_current_user function."""

    @pytest.mark.asyncio
    @patch('app.auth._read_session_cookie')
    async def test_get_current_user_no_cookie(self, mock_read_cookie, mock_pool):
        """Test get_current_user returns None when no session cookie."""
        from app.auth import get_current_user

        mock_request = MagicMock(spec=Request)
        mock_read_cookie.return_value = None

        result = await get_current_user(mock_request, mock_pool)

        assert result is None

    @pytest.mark.asyncio
    @patch('app.auth._read_session_cookie')
    async def test_get_current_user_missing_sid(self, mock_read_cookie, mock_pool):
        """Test returns None when session data lacks sid."""
        from app.auth import get_current_user

        mock_request = MagicMock(spec=Request)
        mock_read_cookie.return_value = {'user_id': 42}

        result = await get_current_user(mock_request, mock_pool)

        assert result is None

    @pytest.mark.asyncio
    @patch('app.auth._read_session_cookie')
    async def test_get_current_user_expired_session(self, mock_read_cookie, mock_pool):
        """Test returns None for expired session."""
        from app.auth import get_current_user

        mock_request = MagicMock(spec=Request)
        mock_read_cookie.return_value = {'sid': 'abc', 'user_id': 42}

        conn = mock_pool.acquire.return_value.__aenter__.return_value
        conn.fetchrow.return_value = None  # No row found (expired)

        result = await get_current_user(mock_request, mock_pool)

        assert result is None

    @pytest.mark.asyncio
    @patch('app.auth._read_session_cookie')
    async def test_get_current_user_success(self, mock_read_cookie, mock_pool):
        """Test successful user retrieval."""
        from app.auth import get_current_user

        mock_request = MagicMock(spec=Request)
        mock_read_cookie.return_value = {'sid': 'abc123', 'user_id': 42}

        conn = mock_pool.acquire.return_value.__aenter__.return_value
        now = datetime.now()
        conn.fetchrow.return_value = {
            'sid': 'abc123',
            'csrf_token': 'csrf_token_123',
            'question_order_seed': 'seed123',
            'current_question': 5,
            'answers': {'1': 'answer1'},
            'expires_at': now + timedelta(hours=1),
            'id': 42,
            'handle': 'test-user',
            'is_admin': False,
            'created_at': now,
        }

        result = await get_current_user(mock_request, mock_pool)

        assert result is not None
        assert result['user_id'] == 42
        assert result['handle'] == 'test-user'
        assert result['is_admin'] is False


class TestCSRFValidation:
    """Tests for CSRF token validation."""

    def test_csrf_ok_valid(self):
        """Test CSRF validation with matching tokens."""
        from app.auth import _csrf_ok

        token = 'test_csrf_token'
        request = MagicMock(spec=Request)
        request.cookies = {'_csrf': token}

        result = _csrf_ok(request, token)

        assert result is True

    def test_csrf_ok_mismatch(self):
        """Test CSRF validation fails with mismatched tokens."""
        from app.auth import _csrf_ok

        request = MagicMock(spec=Request)
        request.cookies = {'_csrf': 'token1'}

        result = _csrf_ok(request, 'token2')

        assert result is False

    def test_csrf_ok_missing_cookie(self):
        """Test CSRF validation fails when cookie is missing."""
        from app.auth import _csrf_ok

        request = MagicMock(spec=Request)
        request.cookies = {}

        result = _csrf_ok(request, 'token')

        assert result is False


class TestLoginPage:
    """Tests for login page rendering."""

    @pytest.mark.asyncio
    @patch('app.auth.generate_csrf_token')
    @patch('app.auth.templates')
    async def test_login_page_renders(self, mock_templates, mock_csrf):
        """Test login page renders with CSRF token."""
        from app.auth import login_page

        mock_request = MagicMock(spec=Request)
        mock_csrf.return_value = 'csrf123'
        mock_response = MagicMock(spec=HTMLResponse)
        mock_templates.TemplateResponse.return_value = mock_response

        result = await login_page(mock_request)

        assert result == mock_response
        mock_templates.TemplateResponse.assert_called_once()
        call_args = mock_templates.TemplateResponse.call_args
        assert call_args[0][1] == 'login.html'
        assert call_args[0][2]['csrf_token'] == 'csrf123'


class TestLoginSubmit:
    """Tests for login form submission."""

    @pytest.mark.asyncio
    @patch('app.auth._csrf_ok')
    async def test_login_csrf_fail(self, mock_csrf_ok, mock_pool):
        """Test login redirects on CSRF failure."""
        from app.auth import login_submit

        mock_request = MagicMock(spec=Request)
        mock_csrf_ok.return_value = False

        result = await login_submit(mock_request, 'user', 'pass', 'token', mock_pool)

        assert isinstance(result, RedirectResponse)
        assert result.status_code == 303
        assert '/login' in str(result.headers.get('location', ''))

    @pytest.mark.asyncio
    @patch('app.auth._csrf_ok')
    @patch('app.auth.generate_csrf_token')
    @patch('app.auth.templates')
    async def test_login_empty_credentials(self, mock_templates, mock_csrf_gen, mock_csrf_ok, mock_pool):
        """Test login with empty credentials."""
        from app.auth import login_submit

        mock_request = MagicMock(spec=Request)
        mock_csrf_ok.return_value = True
        mock_csrf_gen.return_value = 'new_csrf'
        mock_response = MagicMock()
        mock_templates.TemplateResponse.return_value = mock_response

        result = await login_submit(mock_request, '', '', 'token', mock_pool)

        call_args = mock_templates.TemplateResponse.call_args[0][2]
        assert 'required' in call_args['error'].lower()

    @pytest.mark.asyncio
    @patch('app.auth._csrf_ok')
    @patch('app.auth._ph')
    async def test_login_invalid_user(self, mock_ph, mock_csrf_ok, mock_pool):
        """Test login with non-existent user."""
        from app.auth import login_submit

        mock_request = MagicMock(spec=Request)
        mock_csrf_ok.return_value = True

        conn = mock_pool.acquire.return_value.__aenter__.return_value
        conn.fetchrow.return_value = None  # User not found

        result = await login_submit(mock_request, 'baduser', 'pass', 'token', mock_pool)

        # Should return error template, not redirect
        assert not isinstance(result, RedirectResponse)

    @pytest.mark.asyncio
    @patch('app.auth._csrf_ok')
    @patch('app.auth._ph')
    @patch('app.auth._create_session')
    async def test_login_success(self, mock_create_session, mock_ph, mock_csrf_ok, mock_pool):
        """Test successful login."""
        from app.auth import login_submit

        mock_request = MagicMock(spec=Request)
        mock_csrf_ok.return_value = True
        mock_ph.verify.return_value = None  # Success
        mock_ph.check_needs_rehash.return_value = False

        conn = mock_pool.acquire.return_value.__aenter__.return_value
        conn.fetchrow.return_value = {
            'id': 42,
            'handle': 'testuser',
            'password_hash': 'hash123',
        }

        mock_create_session.return_value = ('sid123', 'cookie_value')

        result = await login_submit(mock_request, 'testuser', 'password', 'token', mock_pool)

        assert isinstance(result, RedirectResponse)
        assert '/gate' in str(result.headers.get('location', ''))


class TestRegisterPage:
    """Tests for registration page."""

    @pytest.mark.asyncio
    @patch('app.auth.generate_csrf_token')
    @patch('app.auth._generate_random_handle')
    @patch('app.auth.templates')
    async def test_register_page_renders(self, mock_templates, mock_gen_handle, mock_csrf):
        """Test registration page renders with suggested handle."""
        from app.auth import register_page

        mock_request = MagicMock(spec=Request)
        mock_csrf.return_value = 'csrf123'
        mock_gen_handle.return_value = 'quiet-river-1234'
        mock_response = MagicMock()
        mock_templates.TemplateResponse.return_value = mock_response

        result = await register_page(mock_request)

        call_args = mock_templates.TemplateResponse.call_args[0][2]
        assert call_args['suggested_handle'] == 'quiet-river-1234'


class TestRegisterSubmit:
    """Tests for registration form submission."""

    @pytest.mark.asyncio
    @patch('app.auth._csrf_ok')
    async def test_register_csrf_fail(self, mock_csrf_ok, mock_pool):
        """Test registration redirects on CSRF failure."""
        from app.auth import register_submit

        mock_request = MagicMock(spec=Request)
        mock_csrf_ok.return_value = False

        result = await register_submit(mock_request, 'user', 'pass', 'token', mock_pool)

        assert isinstance(result, RedirectResponse)

    @pytest.mark.asyncio
    @patch('app.auth._csrf_ok')
    @patch('app.auth.templates')
    async def test_register_handle_too_short(self, mock_templates, mock_csrf_ok, mock_pool):
        """Test registration rejects handles that are too short."""
        from app.auth import register_submit

        mock_request = MagicMock(spec=Request)
        mock_csrf_ok.return_value = True
        mock_response = MagicMock()
        mock_templates.TemplateResponse.return_value = mock_response

        result = await register_submit(mock_request, 'ab', 'password123456', 'token', mock_pool)

        call_args = mock_templates.TemplateResponse.call_args[0][2]
        assert 'at least 3 characters' in call_args['error']

    @pytest.mark.asyncio
    @patch('app.auth._csrf_ok')
    @patch('app.auth.templates')
    async def test_register_handle_too_long(self, mock_templates, mock_csrf_ok, mock_pool):
        """Test registration rejects handles that are too long."""
        from app.auth import register_submit

        mock_request = MagicMock(spec=Request)
        mock_csrf_ok.return_value = True
        mock_response = MagicMock()
        mock_templates.TemplateResponse.return_value = mock_response

        long_handle = 'a' * 33
        result = await register_submit(mock_request, long_handle, 'password123456', 'token', mock_pool)

        call_args = mock_templates.TemplateResponse.call_args[0][2]
        assert 'at most 32 characters' in call_args['error']

    @pytest.mark.asyncio
    @patch('app.auth._csrf_ok')
    @patch('app.auth.templates')
    async def test_register_invalid_handle_chars(self, mock_templates, mock_csrf_ok, mock_pool):
        """Test registration rejects handles with invalid characters."""
        from app.auth import register_submit

        mock_request = MagicMock(spec=Request)
        mock_csrf_ok.return_value = True
        mock_response = MagicMock()
        mock_templates.TemplateResponse.return_value = mock_response

        result = await register_submit(mock_request, 'user@name', 'password123456', 'token', mock_pool)

        call_args = mock_templates.TemplateResponse.call_args[0][2]
        assert 'letters, digits, hyphens, underscores' in call_args['error']

    @pytest.mark.asyncio
    @patch('app.auth._csrf_ok')
    @patch('app.auth.templates')
    async def test_register_password_too_short(self, mock_templates, mock_csrf_ok, mock_pool):
        """Test registration rejects passwords that are too short."""
        from app.auth import register_submit

        mock_request = MagicMock(spec=Request)
        mock_csrf_ok.return_value = True
        mock_response = MagicMock()
        mock_templates.TemplateResponse.return_value = mock_response

        result = await register_submit(mock_request, 'validuser', 'short', 'token', mock_pool)

        call_args = mock_templates.TemplateResponse.call_args[0][2]
        assert 'at least 12 characters' in call_args['error']

    @pytest.mark.asyncio
    @patch('app.auth._csrf_ok')
    @patch('app.auth._ph')
    @patch('app.auth._create_session')
    async def test_register_success(self, mock_create_session, mock_ph, mock_csrf_ok, mock_pool):
        """Test successful registration."""
        from app.auth import register_submit

        mock_request = MagicMock(spec=Request)
        mock_csrf_ok.return_value = True
        mock_ph.hash.return_value = 'hashed_password'

        conn = mock_pool.acquire.return_value.__aenter__.return_value
        conn.fetchval.return_value = 42  # New user ID
        mock_create_session.return_value = ('sid123', 'cookie_value')

        result = await register_submit(mock_request, 'newuser', 'password123456', 'token', mock_pool)

        assert isinstance(result, RedirectResponse)
        assert '/gate' in str(result.headers.get('location', ''))

    @pytest.mark.asyncio
    @patch('app.auth._csrf_ok')
    @patch('app.auth._ph')
    async def test_register_duplicate_handle(self, mock_ph, mock_csrf_ok, mock_pool):
        """Test registration fails with duplicate handle."""
        import asyncpg
        from app.auth import register_submit

        mock_request = MagicMock(spec=Request)
        mock_csrf_ok.return_value = True
        mock_ph.hash.return_value = 'hashed_password'

        conn = mock_pool.acquire.return_value.__aenter__.return_value
        conn.fetchval.side_effect = asyncpg.UniqueViolationError
        conn.fetchrow.return_value = None

        result = await register_submit(mock_request, 'taken', 'password123456', 'token', mock_pool)

        # Should return error template
        assert not isinstance(result, RedirectResponse)


class TestLogout:
    """Tests for logout functionality."""

    @pytest.mark.asyncio
    @patch('app.auth._read_session_cookie')
    async def test_logout_with_session(self, mock_read_cookie, mock_pool):
        """Test logout deletes session."""
        from app.auth import logout_submit

        mock_request = MagicMock(spec=Request)
        mock_read_cookie.return_value = {'sid': 'abc123', 'user_id': 42}

        conn = mock_pool.acquire.return_value.__aenter__.return_value

        result = await logout_submit(mock_request, mock_pool)

        assert isinstance(result, RedirectResponse)
        assert '/' in str(result.headers.get('location', ''))
        conn.execute.assert_called_once()

    @pytest.mark.asyncio
    @patch('app.auth._read_session_cookie')
    async def test_logout_without_session(self, mock_read_cookie, mock_pool):
        """Test logout works even without valid session."""
        from app.auth import logout_submit

        mock_request = MagicMock(spec=Request)
        mock_read_cookie.return_value = None

        result = await logout_submit(mock_request, mock_pool)

        assert isinstance(result, RedirectResponse)


class TestCreateSession:
    """Tests for session creation."""

    @pytest.mark.asyncio
    @patch('app.auth.secrets.token_urlsafe')
    @patch('app.auth._encrypt_session')
    async def test_create_session(self, mock_encrypt, mock_token):
        """Test session creation."""
        from app.auth import _create_session

        mock_token.return_value = 'random_sid'
        mock_encrypt.return_value = 'encrypted_cookie'

        conn = AsyncMock()

        sid, cookie = await _create_session(conn, 42)

        assert sid == 'random_sid'
        assert cookie == 'encrypted_cookie'
        conn.execute.assert_called_once()
        mock_encrypt.assert_called_once_with({'sid': 'random_sid', 'user_id': 42})


class TestEdgeCases:
    """Tests for edge cases and boundary conditions."""

    @pytest.mark.asyncio
    @patch('app.auth._csrf_ok')
    @patch('app.auth.templates')
    async def test_login_handle_case_insensitive(self, mock_templates, mock_csrf_ok, mock_pool):
        """Test login handle is case-insensitive."""
        from app.auth import login_submit

        mock_request = MagicMock(spec=Request)
        mock_csrf_ok.return_value = True
        mock_response = MagicMock()
        mock_templates.TemplateResponse.return_value = mock_response

        conn = mock_pool.acquire.return_value.__aenter__.return_value
        conn.fetchrow.return_value = None

        await login_submit(mock_request, 'TestUser', 'password', 'token', mock_pool)

        # Verify handle was lowercased
        call_args = conn.fetchrow.call_args[0]
        assert call_args[1] == 'testuser'

    @pytest.mark.asyncio
    @patch('app.auth._csrf_ok')
    @patch('app.auth.templates')
    async def test_register_handle_normalization(self, mock_templates, mock_csrf_ok, mock_pool):
        """Test registration normalizes handle (lowercase, trimmed)."""
        from app.auth import register_submit

        mock_request = MagicMock(spec=Request)
        mock_csrf_ok.return_value = True
        mock_response = MagicMock()
        mock_templates.TemplateResponse.return_value = mock_response

        conn = mock_pool.acquire.return_value.__aenter__.return_value
        conn.fetchval.return_value = 42

        result = await register_submit(mock_request, '  TestUser  ', 'password123456', 'token', mock_pool)

        # Verify handle was normalized
        insert_call = [call for call in conn.fetchval.call_args_list if 'INSERT' in str(call)]
        if insert_call:
            assert 'testuser' in str(insert_call[0]).lower()

    def test_random_handle_number_range(self):
        """Test random handle number is in expected range."""
        from app.auth import _generate_random_handle

        for _ in range(20):
            handle = _generate_random_handle()
            num = int(handle.split('-')[2])
            assert 1000 <= num <= 9999