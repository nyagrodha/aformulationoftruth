"""Pytest configuration and fixtures for testing."""

import asyncio
from typing import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock, patch

import asyncpg
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient


@pytest.fixture(scope="session")
def event_loop():
    """Create event loop for async tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def mock_pool():
    """Mock asyncpg connection pool."""
    pool = MagicMock(spec=asyncpg.Pool)
    conn = AsyncMock(spec=asyncpg.Connection)

    # Mock connection context manager
    conn.__aenter__ = AsyncMock(return_value=conn)
    conn.__aexit__ = AsyncMock(return_value=None)

    # Mock transaction
    transaction = AsyncMock()
    transaction.__aenter__ = AsyncMock(return_value=transaction)
    transaction.__aexit__ = AsyncMock(return_value=None)
    conn.transaction = MagicMock(return_value=transaction)

    # Mock pool.acquire()
    pool.acquire = MagicMock(return_value=conn)

    return pool


@pytest.fixture
def mock_db_user():
    """Mock database user record."""
    return {
        "id": 1,
        "handle": "test-user-1234",
        "password_hash": "$argon2id$v=19$m=65536,t=3,p=4$test",
        "is_admin": False,
        "created_at": None,
    }


@pytest.fixture
def mock_session():
    """Mock session data."""
    return {
        "sid": "test-session-id",
        "user_id": 1,
        "csrf_token": "test-csrf-token",
        "question_order_seed": "test-seed",
        "current_question": 0,
        "answers": {},
        "expires_at": None,
    }


@pytest.fixture
def fernet_key():
    """Generate a valid Fernet key for testing."""
    return Fernet.generate_key().decode()


@pytest.fixture
def test_settings(fernet_key):
    """Mock application settings."""
    with patch("app.config.settings") as mock_settings:
        mock_settings.database_url = "postgresql://test@localhost/test"
        mock_settings.session_secret = fernet_key
        mock_settings.hmac_secret = "test-hmac-secret"
        mock_settings.age_recipient = "age1test..."
        mock_settings.session_max_age = 86400
        mock_settings.rate_limit_window = 60
        mock_settings.rate_limit_max = 10
        mock_settings.lotto_min_participants = 15
        mock_settings.lotto_window_days = 21
        mock_settings.lotto_claim_window_days = 7
        mock_settings.lotto_drand_url_template = "https://api.drand.sh/public/{round}"
        mock_settings.lotto_default_drand_round_target = 0
        mock_settings.lotto_operator_token = "test-operator-token"
        mock_settings.lotto_operator_signing_key_b64 = ""
        yield mock_settings


@pytest.fixture
def test_client(test_settings):
    """Create FastAPI test client."""
    from app.main import app

    # Mock the database pool
    with patch("app.db.get_pool") as mock_get_pool:
        mock_pool_instance = MagicMock(spec=asyncpg.Pool)
        mock_get_pool.return_value = mock_pool_instance

        # Mock the lifespan
        with patch("app.main.init_pool") as mock_init:
            with patch("app.main.verify_schema"):
                mock_init.return_value = mock_pool_instance
                client = TestClient(app)
                yield client