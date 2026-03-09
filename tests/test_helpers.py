"""Test helper utilities for async mocking."""

from unittest.mock import AsyncMock, MagicMock


class AsyncContextManager:
    """Helper class for mocking async context managers."""

    def __init__(self, return_value):
        self.return_value = return_value

    async def __aenter__(self):
        return self.return_value

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        return None


def make_async_pool_mock(conn_mock):
    """Create a mock asyncpg pool with proper context manager support."""
    pool = AsyncMock()
    pool.acquire = MagicMock(return_value=AsyncContextManager(conn_mock))
    return pool