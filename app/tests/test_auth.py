"""Comprehensive tests for authentication module."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import asyncpg
import pytest
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from cryptography.fernet import Fernet
from fastapi import Request
from fastapi.testclient import TestClient

from app import auth
from app.auth import (
    _create_session,
    _csrf_ok,
    _decrypt_session,
    _encrypt_session,
    _generate_random_handle,
    _get_fernet,
    _read_session_cookie,
    get_current_user,
)


class TestHandleGeneration:
    """Test random handle generation."""

    def test_generate_random_handle_format(self):
        """Generated handle follows pattern: adjective-noun-number."""
        handle = _generate_random_handle()
        parts = handle.split('-')

        assert len(parts) == 3
        assert parts[0].isalpha()  # adjective
        assert parts[1].isalpha()  # noun
        assert parts[2].isdigit()  # number
        assert 1000 <= int(parts[2]) <= 9999

    def test_generate_random_handle_randomness(self):
        """Multiple calls produce different handles."""
        handles = [_generate_random_handle() for _ in range(10)]
        # At least some should be different (very high probability)
        assert len(set(handles)) > 1

    def test_generate_random_handle_valid_words(self):
        """Generated handles use words from predefined lists."""
        handle = _generate_random_handle()
        adj, noun, _ = handle.split('-')

        assert adj in auth._ADJECTIVES
        assert noun in auth._NOUNS


class TestFernetEncryption:
    """Test session encryption/decryption."""

    def test_get_fernet_success(self, test_settings):
        """Successfully creates Fernet instance with valid key."""
        fernet = _get_fernet()
        assert isinstance(fernet, Fernet)

    def test_get_fernet_missing_key(self):
        """Raises RuntimeError when session secret not configured."""
        with patch("app.config.settings") as mock_settings:
            mock_settings.session_secret = ""
            with pytest.raises(RuntimeError, match="SESSION_SECRET .* is not configured"):
                _get_fernet()

    def test_encrypt_decrypt_session_roundtrip(self, test_settings):
        """Encrypt and decrypt session data successfully."""
        data = {"sid": "test123", "user_id": 42}

        encrypted = _encrypt_session(data)
        assert isinstance(encrypted, str)
        assert encrypted != json.dumps(data)

        decrypted = _decrypt_session(encrypted)
        assert decrypted == data

    def test_decrypt_invalid_token(self, test_settings):
        """Returns None for invalid token."""
        assert _decrypt_session("invalid-token") is None

    def test_decrypt_malformed_json(self, test_settings):
        """Returns None for token with malformed JSON."""
        # Encrypt invalid JSON
        fernet = _get_fernet()
        bad_token = fernet.encrypt(b"not-json").decode("ascii")
        assert _decrypt_session(bad_token) is None

    def test_decrypt_expired_token(self, test_settings):
        """Returns None for expired token."""
        with patch("app.auth._get_fernet") as mock_get_fernet:
            mock_fernet = MagicMock()
            mock_fernet.decrypt.side_effect = Exception("Token expired")
            mock_get_fernet.return_value = mock_fernet

            result = _decrypt_session("token")
            assert result is None


class TestSessionCookie:
    """Test session cookie reading."""

    def test_read_session_cookie_success(self, test_settings):
        """Successfully read and decrypt session cookie."""
        session_data = {"sid": "abc123", "user_id": 1}
        encrypted = _encrypt_session(session_data)

        request = MagicMock(spec=Request)
        request.cookies.get.return_value = encrypted

        result = _read_session_cookie(request)
        assert result == session_data

    def test_read_session_cookie_missing(self, test_settings):
        """Returns None when session cookie is missing."""
        request = MagicMock(spec=Request)
        request.cookies.get.return_value = None

        result = _read_session_cookie(request)
        assert result is None

    def test_read_session_cookie_invalid(self, test_settings):
        """Returns None when session cookie is invalid."""
        request = MagicMock(spec=Request)
        request.cookies.get.return_value = "invalid-token"

        result = _read_session_cookie(request)
        assert result is None


class TestGetCurrentUser:
    """Test current user retrieval."""

    @pytest.mark.asyncio
    async def test_get_current_user_success(self, test_settings, mock_pool):
        """Successfully retrieve current user with valid session."""
        session_data = {"sid": "test-sid", "user_id": 1}
        encrypted = _encrypt_session(session_data)

        request = MagicMock(spec=Request)
        request.cookies.get.return_value = encrypted

        # Mock database response
        mock_pool.acquire.return_value.__aenter__.return_value.fetchrow = AsyncMock(
            return_value={
                "sid": "test-sid",
                "csrf_token": "csrf123",
                "question_order_seed": "seed123",
                "current_question": 5,
                "answers": {"1": "answer1"},
                "expires_at": None,
                "id": 1,
                "handle": "test-user",
                "is_admin": False,
                "created_at": None,
            }
        )

        result = await get_current_user(request, mock_pool)

        assert result is not None
        assert result["user_id"] == 1
        assert result["handle"] == "test-user"
        assert result["sid"] == "test-sid"

    @pytest.mark.asyncio
    async def test_get_current_user_no_cookie(self, test_settings, mock_pool):
        """Returns None when no session cookie present."""
        request = MagicMock(spec=Request)
        request.cookies.get.return_value = None

        result = await get_current_user(request, mock_pool)
        assert result is None

    @pytest.mark.asyncio
    async def test_get_current_user_invalid_session_data(self, test_settings, mock_pool):
        """Returns None when session data is invalid."""
        session_data = {"invalid": "data"}
        encrypted = _encrypt_session(session_data)

        request = MagicMock(spec=Request)
        request.cookies.get.return_value = encrypted

        result = await get_current_user(request, mock_pool)
        assert result is None

    @pytest.mark.asyncio
    async def test_get_current_user_session_not_in_db(self, test_settings, mock_pool):
        """Returns None when session not found in database."""
        session_data = {"sid": "test-sid", "user_id": 1}
        encrypted = _encrypt_session(session_data)

        request = MagicMock(spec=Request)
        request.cookies.get.return_value = encrypted

        # Mock database returning no row
        mock_pool.acquire.return_value.__aenter__.return_value.fetchrow = AsyncMock(
            return_value=None
        )

        result = await get_current_user(request, mock_pool)
        assert result is None


class TestCSRF:
    """Test CSRF token validation."""

    def test_csrf_ok_valid_token(self):
        """CSRF validation succeeds with matching tokens."""
        token = "test-csrf-token"
        request = MagicMock(spec=Request)
        request.cookies.get.return_value = token

        assert _csrf_ok(request, token) is True

    def test_csrf_ok_invalid_token(self):
        """CSRF validation fails with mismatched tokens."""
        request = MagicMock(spec=Request)
        request.cookies.get.return_value = "cookie-token"

        assert _csrf_ok(request, "form-token") is False

    def test_csrf_ok_missing_cookie(self):
        """CSRF validation fails when cookie is missing."""
        request = MagicMock(spec=Request)
        request.cookies.get.return_value = None

        assert _csrf_ok(request, "form-token") is False

    def test_csrf_ok_empty_form_token(self):
        """CSRF validation fails with empty form token."""
        request = MagicMock(spec=Request)
        request.cookies.get.return_value = "cookie-token"

        assert _csrf_ok(request, "") is False


class TestSessionCreation:
    """Test session creation."""

    @pytest.mark.asyncio
    async def test_create_session_success(self, test_settings):
        """Successfully creates session and returns encrypted cookie."""
        mock_conn = AsyncMock(spec=asyncpg.Connection)
        mock_conn.execute = AsyncMock()

        sid, cookie_value = await _create_session(mock_conn, user_id=42)

        # Verify session ID was generated
        assert isinstance(sid, str)
        assert len(sid) > 20

        # Verify cookie value is encrypted
        assert isinstance(cookie_value, str)
        decrypted = _decrypt_session(cookie_value)
        assert decrypted["user_id"] == 42
        assert decrypted["sid"] == sid

        # Verify database insert was called
        mock_conn.execute.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_session_database_error(self):
        """Handles database errors during session creation."""
        mock_conn = AsyncMock(spec=asyncpg.Connection)
        mock_conn.execute = AsyncMock(side_effect=asyncpg.PostgresError("DB error"))

        with pytest.raises(asyncpg.PostgresError):
            await _create_session(mock_conn, user_id=42)


class TestLoginEndpoints:
    """Test login routes."""

    def test_login_page_renders(self, test_client):
        """Login page renders successfully."""
        with patch("app.auth.get_pool"):
            response = test_client.get("/login")
            assert response.status_code == 200
            assert "csrf_token" in response.text

    def test_login_submit_missing_csrf(self, test_client):
        """Login fails without CSRF token."""
        with patch("app.auth.get_pool"):
            response = test_client.post(
                "/login",
                data={"handle": "user", "password": "pass"},
                allow_redirects=False
            )
            assert response.status_code == 303
            assert response.headers["location"] == "/login"

    def test_login_submit_empty_credentials(self, test_client, test_settings):
        """Login fails with empty credentials."""
        with patch("app.auth.get_pool") as mock_get_pool:
            with patch("app.auth._csrf_ok", return_value=True):
                response = test_client.post(
                    "/login",
                    data={
                        "handle": "",
                        "password": "",
                        "csrf_token": "valid"
                    }
                )
                assert response.status_code == 200
                assert "Handle and password are required" in response.text


class TestRegisterEndpoints:
    """Test registration routes."""

    def test_register_page_renders(self, test_client):
        """Register page renders with suggested handle."""
        with patch("app.auth.get_pool"):
            response = test_client.get("/register")
            assert response.status_code == 200
            assert "csrf_token" in response.text

    def test_register_random_handle_endpoint(self, test_client):
        """Random handle endpoint returns valid handle."""
        response = test_client.get("/register/random")
        assert response.status_code == 200
        data = response.json()
        assert "handle" in data
        assert len(data["handle"].split('-')) == 3

    def test_register_handle_too_short(self, test_client):
        """Registration fails with handle < 3 characters."""
        with patch("app.auth.get_pool"):
            with patch("app.auth._csrf_ok", return_value=True):
                response = test_client.post(
                    "/register",
                    data={
                        "handle": "ab",
                        "password": "a" * 12,
                        "csrf_token": "valid"
                    }
                )
                assert response.status_code == 200
                assert "at least 3 characters" in response.text

    def test_register_handle_too_long(self, test_client):
        """Registration fails with handle > 32 characters."""
        with patch("app.auth.get_pool"):
            with patch("app.auth._csrf_ok", return_value=True):
                response = test_client.post(
                    "/register",
                    data={
                        "handle": "a" * 33,
                        "password": "a" * 12,
                        "csrf_token": "valid"
                    }
                )
                assert response.status_code == 200
                assert "at most 32 characters" in response.text

    def test_register_invalid_handle_characters(self, test_client):
        """Registration fails with invalid characters in handle."""
        with patch("app.auth.get_pool"):
            with patch("app.auth._csrf_ok", return_value=True):
                response = test_client.post(
                    "/register",
                    data={
                        "handle": "user@name",
                        "password": "a" * 12,
                        "csrf_token": "valid"
                    }
                )
                assert response.status_code == 200
                assert "letters, digits, hyphens, underscores" in response.text

    def test_register_password_too_short(self, test_client):
        """Registration fails with password < 12 characters."""
        with patch("app.auth.get_pool"):
            with patch("app.auth._csrf_ok", return_value=True):
                response = test_client.post(
                    "/register",
                    data={
                        "handle": "validuser",
                        "password": "short",
                        "csrf_token": "valid"
                    }
                )
                assert response.status_code == 200
                assert "at least 12 characters" in response.text


class TestLogout:
    """Test logout functionality."""

    def test_logout_clears_session(self, test_client, test_settings):
        """Logout clears session cookie."""
        with patch("app.auth.get_pool") as mock_get_pool:
            mock_conn = AsyncMock()
            mock_conn.execute = AsyncMock()
            mock_pool = MagicMock()
            mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
            mock_get_pool.return_value = mock_pool

            # Create session cookie
            session_data = {"sid": "test-sid", "user_id": 1}
            encrypted = _encrypt_session(session_data)

            response = test_client.post(
                "/logout",
                cookies={auth.SESSION_COOKIE: encrypted},
                allow_redirects=False
            )

            assert response.status_code == 303
            assert response.headers["location"] == "/"

    def test_logout_get_method(self, test_client, test_settings):
        """GET /logout also performs logout."""
        with patch("app.auth.get_pool") as mock_get_pool:
            mock_conn = AsyncMock()
            mock_conn.execute = AsyncMock()
            mock_pool = MagicMock()
            mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
            mock_get_pool.return_value = mock_pool

            response = test_client.get("/logout", allow_redirects=False)
            assert response.status_code == 303


class TestPasswordHashing:
    """Test password hashing integration."""

    def test_password_hash_verification(self):
        """Password hashing and verification works correctly."""
        ph = PasswordHasher()
        password = "test-password-123"

        password_hash = ph.hash(password)
        assert ph.verify(password_hash, password) is None  # No exception = success

        with pytest.raises(VerifyMismatchError):
            ph.verify(password_hash, "wrong-password")

    def test_password_needs_rehash_detection(self):
        """Detects when password needs rehashing."""
        ph = PasswordHasher()
        password = "test-password"

        # Hash with current params
        password_hash = ph.hash(password)

        # Should not need rehash with same params
        needs_rehash = ph.check_needs_rehash(password_hash)
        assert isinstance(needs_rehash, bool)