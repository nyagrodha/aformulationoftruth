"""Comprehensive tests for app/auth.py authentication module."""

import json
import secrets
from datetime import datetime
from unittest.mock import AsyncMock, Mock, patch, MagicMock
import pytest
from fastapi import Request
from cryptography.fernet import Fernet

from app.auth import (
    _generate_random_handle,
    _get_fernet,
    _encrypt_session,
    _decrypt_session,
    _read_session_cookie,
    _csrf_ok,
    SESSION_COOKIE,
)


class TestGenerateRandomHandle:
    """Test random handle generation."""

    def test_generate_random_handle_format(self):
        """Test handle format is adjective-noun-number."""
        handle = _generate_random_handle()
        parts = handle.split("-")
        assert len(parts) == 3
        assert parts[0].isalpha()  # adjective
        assert parts[1].isalpha()  # noun
        assert parts[2].isdigit()  # number

    def test_generate_random_handle_number_range(self):
        """Test number is in range 1000-9999."""
        handle = _generate_random_handle()
        number = int(handle.split("-")[2])
        assert 1000 <= number <= 9999

    def test_generate_random_handle_uniqueness(self):
        """Test that multiple calls produce different handles (high probability)."""
        handles = [_generate_random_handle() for _ in range(100)]
        # Should have at least 90% unique (allowing for rare collisions)
        assert len(set(handles)) > 90

    def test_generate_random_handle_no_spaces(self):
        """Test handle contains no spaces."""
        handle = _generate_random_handle()
        assert " " not in handle

    def test_generate_random_handle_lowercase(self):
        """Test handle is lowercase."""
        handle = _generate_random_handle()
        assert handle == handle.lower()


class TestFernetEncryption:
    """Test Fernet session encryption/decryption."""

    def test_get_fernet_with_valid_key(self):
        """Test Fernet initialization with valid key."""
        key = Fernet.generate_key()
        with patch("app.auth.settings") as mock_settings:
            mock_settings.session_secret = key.decode()
            fernet = _get_fernet()
            assert fernet is not None

    def test_get_fernet_no_key_raises(self):
        """Test error when no session secret configured."""
        with patch("app.auth.settings") as mock_settings:
            mock_settings.session_secret = ""
            with pytest.raises(RuntimeError) as exc_info:
                _get_fernet()
            assert "SESSION_SECRET" in str(exc_info.value)

    def test_encrypt_session_returns_string(self):
        """Test session encryption returns ASCII string."""
        key = Fernet.generate_key()
        with patch("app.auth.settings") as mock_settings:
            mock_settings.session_secret = key.decode()

            data = {"sid": "test123", "user_id": 42}
            token = _encrypt_session(data)

            assert isinstance(token, str)
            assert all(ord(c) < 128 for c in token)  # ASCII

    def test_encrypt_decrypt_roundtrip(self):
        """Test encrypt/decrypt round trip."""
        key = Fernet.generate_key()
        with patch("app.auth.settings") as mock_settings:
            mock_settings.session_secret = key.decode()
            mock_settings.session_max_age = 3600

            data = {"sid": "session123", "user_id": 99}
            token = _encrypt_session(data)
            decrypted = _decrypt_session(token)

            assert decrypted == data

    def test_decrypt_session_invalid_token(self):
        """Test decryption of invalid token returns None."""
        key = Fernet.generate_key()
        with patch("app.auth.settings") as mock_settings:
            mock_settings.session_secret = key.decode()
            mock_settings.session_max_age = 3600

            result = _decrypt_session("invalid_token")
            assert result is None

    def test_decrypt_session_wrong_key(self):
        """Test decryption with wrong key returns None."""
        key1 = Fernet.generate_key()
        key2 = Fernet.generate_key()

        with patch("app.auth.settings") as mock_settings:
            mock_settings.session_secret = key1.decode()
            mock_settings.session_max_age = 3600
            data = {"sid": "test"}
            token = _encrypt_session(data)

            # Try to decrypt with different key
            mock_settings.session_secret = key2.decode()
            result = _decrypt_session(token)
            assert result is None

    def test_decrypt_session_corrupted_json(self):
        """Test decryption with corrupted JSON returns None."""
        key = Fernet.generate_key()
        fernet = Fernet(key)

        # Encrypt invalid JSON
        token = fernet.encrypt(b"not valid json").decode("ascii")

        with patch("app.auth.settings") as mock_settings:
            mock_settings.session_secret = key.decode()
            mock_settings.session_max_age = 3600

            result = _decrypt_session(token)
            assert result is None

    def test_encrypt_session_empty_dict(self):
        """Test encrypting empty session dict."""
        key = Fernet.generate_key()
        with patch("app.auth.settings") as mock_settings:
            mock_settings.session_secret = key.decode()
            mock_settings.session_max_age = 3600

            token = _encrypt_session({})
            decrypted = _decrypt_session(token)
            assert decrypted == {}

    def test_encrypt_session_complex_data(self):
        """Test encrypting complex session data."""
        key = Fernet.generate_key()
        with patch("app.auth.settings") as mock_settings:
            mock_settings.session_secret = key.decode()
            mock_settings.session_max_age = 3600

            data = {
                "sid": "abc123",
                "user_id": 42,
                "handle": "test-user-1234",
                "is_admin": False,
                "csrf_token": "csrf_token_value",
            }
            token = _encrypt_session(data)
            decrypted = _decrypt_session(token)
            assert decrypted == data


class TestReadSessionCookie:
    """Test session cookie reading."""

    def test_read_session_cookie_valid(self):
        """Test reading valid session cookie."""
        key = Fernet.generate_key()
        with patch("app.auth.settings") as mock_settings:
            mock_settings.session_secret = key.decode()
            mock_settings.session_max_age = 3600

            data = {"sid": "test123", "user_id": 42}
            token = _encrypt_session(data)

            request = Mock(spec=Request)
            request.cookies = {SESSION_COOKIE: token}

            result = _read_session_cookie(request)
            assert result == data

    def test_read_session_cookie_missing(self):
        """Test reading missing cookie returns None."""
        request = Mock(spec=Request)
        request.cookies = {}

        result = _read_session_cookie(request)
        assert result is None

    def test_read_session_cookie_invalid(self):
        """Test reading invalid cookie returns None."""
        key = Fernet.generate_key()
        with patch("app.auth.settings") as mock_settings:
            mock_settings.session_secret = key.decode()
            mock_settings.session_max_age = 3600

            request = Mock(spec=Request)
            request.cookies = {SESSION_COOKIE: "invalid_token"}

            result = _read_session_cookie(request)
            assert result is None


class TestCSRFValidation:
    """Test CSRF token validation."""

    def test_csrf_ok_valid(self):
        """Test valid CSRF token."""
        token = secrets.token_urlsafe(32)
        request = Mock(spec=Request)
        request.cookies = {"_csrf": token}

        assert _csrf_ok(request, token) is True

    def test_csrf_ok_invalid(self):
        """Test invalid CSRF token."""
        request = Mock(spec=Request)
        request.cookies = {"_csrf": "token1"}

        assert _csrf_ok(request, "token2") is False

    def test_csrf_ok_missing_cookie(self):
        """Test missing CSRF cookie."""
        request = Mock(spec=Request)
        request.cookies = {}

        assert _csrf_ok(request, "any_token") is False

    def test_csrf_ok_empty_form_token(self):
        """Test empty form token."""
        request = Mock(spec=Request)
        request.cookies = {"_csrf": "valid_token"}

        assert _csrf_ok(request, "") is False

    def test_csrf_ok_timing_safe_compare(self):
        """Test that comparison is timing-safe (uses secrets.compare_digest)."""
        token = "test_token"
        request = Mock(spec=Request)
        request.cookies = {"_csrf": token}

        # Should use constant-time comparison
        with patch("app.auth.secrets.compare_digest") as mock_compare:
            mock_compare.return_value = True
            result = _csrf_ok(request, token)
            assert result is True
            mock_compare.assert_called_once()


class TestGetCurrentUser:
    """Test get_current_user dependency."""

    @pytest.mark.asyncio
    async def test_get_current_user_valid_session(self):
        """Test retrieving valid user session."""
        from app.auth import get_current_user

        key = Fernet.generate_key()
        with patch("app.auth.settings") as mock_settings:
            mock_settings.session_secret = key.decode()
            mock_settings.session_max_age = 3600

            data = {"sid": "session123", "user_id": 42}
            token = _encrypt_session(data)

            request = Mock(spec=Request)
            request.cookies = {SESSION_COOKIE: token}

            # Mock database
            mock_pool = AsyncMock()
            mock_conn = AsyncMock()
            # Properly mock async context manager
            mock_pool.acquire = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_conn), __aexit__=AsyncMock()))

            # Mock database row
            mock_row = {
                "sid": "session123",
                "csrf_token": "csrf123",
                "question_order_seed": "seed123",
                "current_question": 5,
                "answers": {"1": "answer1"},
                "expires_at": datetime.now(),
                "id": 42,
                "handle": "test-user-1234",
                "is_admin": False,
                "created_at": datetime.now(),
            }
            mock_conn.fetchrow = AsyncMock(return_value=mock_row)

            result = await get_current_user(request, mock_pool)

            assert result is not None
            assert result["user_id"] == 42
            assert result["handle"] == "test-user-1234"
            assert result["is_admin"] is False

    @pytest.mark.asyncio
    async def test_get_current_user_no_cookie(self):
        """Test returns None when no session cookie."""
        from app.auth import get_current_user

        request = Mock(spec=Request)
        request.cookies = {}

        mock_pool = AsyncMock()
        result = await get_current_user(request, mock_pool)
        assert result is None

    @pytest.mark.asyncio
    async def test_get_current_user_invalid_session_data(self):
        """Test returns None when session data missing fields."""
        from app.auth import get_current_user

        key = Fernet.generate_key()
        with patch("app.auth.settings") as mock_settings:
            mock_settings.session_secret = key.decode()
            mock_settings.session_max_age = 3600

            # Missing user_id
            data = {"sid": "session123"}
            token = _encrypt_session(data)

            request = Mock(spec=Request)
            request.cookies = {SESSION_COOKIE: token}

            mock_pool = AsyncMock()
            result = await get_current_user(request, mock_pool)
            assert result is None

    @pytest.mark.asyncio
    async def test_get_current_user_session_not_in_db(self):
        """Test returns None when session not found in database."""
        from app.auth import get_current_user

        key = Fernet.generate_key()
        with patch("app.auth.settings") as mock_settings:
            mock_settings.session_secret = key.decode()
            mock_settings.session_max_age = 3600

            data = {"sid": "session123", "user_id": 42}
            token = _encrypt_session(data)

            request = Mock(spec=Request)
            request.cookies = {SESSION_COOKIE: token}

            mock_pool = AsyncMock()
            mock_conn = AsyncMock()
            mock_pool.acquire = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_conn), __aexit__=AsyncMock()))
            mock_conn.fetchrow = AsyncMock(return_value=None)  # Not found

            result = await get_current_user(request, mock_pool)
            assert result is None


class TestHandleGeneration:
    """Additional tests for handle generation edge cases."""

    def test_handle_valid_characters(self):
        """Test handle contains only valid characters."""
        handle = _generate_random_handle()
        assert all(c.isalnum() or c == "-" for c in handle)

    def test_handle_length_reasonable(self):
        """Test handle length is reasonable (under 32 chars)."""
        handle = _generate_random_handle()
        assert len(handle) < 32

    def test_handle_starts_with_letter(self):
        """Test handle starts with a letter (adjective)."""
        handle = _generate_random_handle()
        assert handle[0].isalpha()

    def test_handle_ends_with_digit(self):
        """Test handle ends with a digit."""
        handle = _generate_random_handle()
        assert handle[-1].isdigit()


class TestSessionEncryptionEdgeCases:
    """Test edge cases in session encryption."""

    def test_encrypt_unicode_data(self):
        """Test encrypting Unicode data."""
        key = Fernet.generate_key()
        with patch("app.auth.settings") as mock_settings:
            mock_settings.session_secret = key.decode()
            mock_settings.session_max_age = 3600

            data = {"handle": "tëst-üsér-1234", "sid": "测试"}
            token = _encrypt_session(data)
            decrypted = _decrypt_session(token)
            assert decrypted == data

    def test_encrypt_large_session_data(self):
        """Test encrypting large session payload."""
        key = Fernet.generate_key()
        with patch("app.auth.settings") as mock_settings:
            mock_settings.session_secret = key.decode()
            mock_settings.session_max_age = 3600

            # Large answers dictionary
            data = {
                "sid": "test",
                "user_id": 1,
                "answers": {str(i): "a" * 500 for i in range(50)},
            }
            token = _encrypt_session(data)
            decrypted = _decrypt_session(token)
            assert decrypted == data

    def test_decrypt_session_with_bytes_key(self):
        """Test Fernet accepts bytes key."""
        key = Fernet.generate_key()
        with patch("app.auth.settings") as mock_settings:
            mock_settings.session_secret = key  # bytes, not string
            mock_settings.session_max_age = 3600

            data = {"sid": "test"}
            token = _encrypt_session(data)
            decrypted = _decrypt_session(token)
            assert decrypted == data


class TestCSRFEdgeCases:
    """Test CSRF validation edge cases."""

    def test_csrf_case_sensitive(self):
        """Test CSRF tokens are case-sensitive."""
        request = Mock(spec=Request)
        request.cookies = {"_csrf": "AbCd"}

        assert _csrf_ok(request, "abcd") is False
        assert _csrf_ok(request, "AbCd") is True

    def test_csrf_whitespace_not_stripped(self):
        """Test CSRF tokens with whitespace."""
        token = " token123 "
        request = Mock(spec=Request)
        request.cookies = {"_csrf": token}

        # Exact match required (no stripping)
        assert _csrf_ok(request, token) is True
        assert _csrf_ok(request, "token123") is False

    def test_csrf_special_characters(self):
        """Test CSRF tokens with special characters."""
        token = "token!@#$%^&*()_+"
        request = Mock(spec=Request)
        request.cookies = {"_csrf": token}

        assert _csrf_ok(request, token) is True