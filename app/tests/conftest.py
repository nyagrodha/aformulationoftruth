"""Shared test fixtures and configuration for pytest."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.fixture
def mock_pool():
    """Mock asyncpg database pool."""
    pool = AsyncMock()
    conn = AsyncMock()
    pool.acquire.return_value.__aenter__.return_value = conn
    return pool


@pytest.fixture
def mock_request():
    """Mock FastAPI Request object."""
    request = MagicMock()
    request.cookies = {}
    request.headers = {}
    request.query_params = {}
    return request


@pytest.fixture
def mock_settings():
    """Mock application settings."""
    with patch('app.config.settings') as mock_settings:
        mock_settings.database_url = "postgresql://test"
        mock_settings.bind_addr = "127.0.0.1:8787"
        mock_settings.rate_limit_window = 60
        mock_settings.rate_limit_max = 10
        mock_settings.session_max_age = 86400
        mock_settings.lotto_min_participants = 15
        mock_settings.lotto_window_days = 21
        mock_settings.lotto_claim_window_days = 7
        mock_settings.lotto_drand_url_template = "https://api.drand.sh/public/{round}"
        mock_settings.lotto_default_drand_round_target = 0
        mock_settings.lotto_operator_token = "test_token"
        mock_settings.lotto_operator_signing_key_b64 = ""
        yield mock_settings