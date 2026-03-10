"""Comprehensive tests for database module."""

from unittest.mock import AsyncMock, MagicMock, patch

import asyncpg
import pytest

from app.db import get_pool, init_pool, verify_schema


class TestDatabasePoolInitialization:
    """Test database pool initialization."""

    @pytest.mark.asyncio
    async def test_init_pool_success(self, test_settings):
        """Successfully initializes database pool."""
        mock_pool = MagicMock(spec=asyncpg.Pool)

        with patch("asyncpg.create_pool", return_value=mock_pool) as mock_create:
            pool = await init_pool()

            assert pool == mock_pool
            mock_create.assert_called_once_with(test_settings.database_url)

    @pytest.mark.asyncio
    async def test_init_pool_uses_settings(self, test_settings):
        """Uses database URL from settings."""
        test_settings.database_url = "postgresql://test@localhost/testdb"
        mock_pool = MagicMock(spec=asyncpg.Pool)

        with patch("asyncpg.create_pool", return_value=mock_pool) as mock_create:
            await init_pool()

            mock_create.assert_called_once_with("postgresql://test@localhost/testdb")

    @pytest.mark.asyncio
    async def test_init_pool_connection_error(self, test_settings):
        """Handles connection errors during initialization."""
        with patch("asyncpg.create_pool", side_effect=asyncpg.PostgresConnectionError("Connection failed")):
            with pytest.raises(asyncpg.PostgresConnectionError):
                await init_pool()


class TestGetPool:
    """Test getting database pool."""

    @pytest.mark.asyncio
    async def test_get_pool_after_init(self, test_settings):
        """Returns pool after initialization."""
        mock_pool = MagicMock(spec=asyncpg.Pool)

        with patch("asyncpg.create_pool", return_value=mock_pool):
            await init_pool()
            pool = await get_pool()

            assert pool == mock_pool

    @pytest.mark.asyncio
    async def test_get_pool_before_init(self):
        """Raises error if pool not initialized."""
        # Reset the global pool
        import app.db
        app.db._pool = None

        with pytest.raises(RuntimeError, match="Database pool not initialized"):
            await get_pool()


class TestVerifySchema:
    """Test schema verification."""

    @pytest.mark.asyncio
    async def test_verify_schema_success(self):
        """Successfully verifies schema exists."""
        mock_conn = AsyncMock(spec=asyncpg.Connection)
        mock_conn.execute = AsyncMock()
        mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_conn.__aexit__ = AsyncMock(return_value=None)

        mock_pool = MagicMock(spec=asyncpg.Pool)
        mock_pool.acquire.return_value = mock_conn

        # Should not raise
        await verify_schema(mock_pool)

        mock_conn.execute.assert_called_once_with("SELECT 1")

    @pytest.mark.asyncio
    async def test_verify_schema_database_error(self):
        """Handles database errors during verification."""
        mock_conn = AsyncMock(spec=asyncpg.Connection)
        mock_conn.execute = AsyncMock(side_effect=asyncpg.PostgresError("DB error"))
        mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_conn.__aexit__ = AsyncMock(return_value=None)

        mock_pool = MagicMock(spec=asyncpg.Pool)
        mock_pool.acquire.return_value = mock_conn

        with pytest.raises(asyncpg.PostgresError):
            await verify_schema(mock_pool)


class TestDatabaseIntegration:
    """Test database integration scenarios."""

    @pytest.mark.asyncio
    async def test_pool_lifecycle(self, test_settings):
        """Tests full pool lifecycle: init -> use -> close."""
        mock_pool = MagicMock(spec=asyncpg.Pool)
        mock_pool.close = AsyncMock()

        with patch("asyncpg.create_pool", return_value=mock_pool):
            # Initialize
            pool = await init_pool()
            assert pool is not None

            # Use
            retrieved_pool = await get_pool()
            assert retrieved_pool == pool

            # Close
            await pool.close()
            mock_pool.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_multiple_get_pool_calls(self, test_settings):
        """Multiple get_pool calls return same instance."""
        mock_pool = MagicMock(spec=asyncpg.Pool)

        with patch("asyncpg.create_pool", return_value=mock_pool):
            await init_pool()

            pool1 = await get_pool()
            pool2 = await get_pool()

            assert pool1 is pool2


class TestDatabaseConfiguration:
    """Test database configuration handling."""

    @pytest.mark.asyncio
    async def test_init_pool_with_unix_socket(self, test_settings):
        """Handles Unix socket database URLs."""
        test_settings.database_url = "postgresql://user@/db?host=/var/run/postgresql"
        mock_pool = MagicMock(spec=asyncpg.Pool)

        with patch("asyncpg.create_pool", return_value=mock_pool) as mock_create:
            await init_pool()

            assert mock_create.called
            call_args = mock_create.call_args[0][0]
            assert "/var/run/postgresql" in call_args

    @pytest.mark.asyncio
    async def test_init_pool_with_ssl(self, test_settings):
        """Handles SSL-enabled database URLs."""
        test_settings.database_url = "postgresql://user@host/db?sslmode=require"
        mock_pool = MagicMock(spec=asyncpg.Pool)

        with patch("asyncpg.create_pool", return_value=mock_pool) as mock_create:
            await init_pool()

            call_args = mock_create.call_args[0][0]
            assert "sslmode=require" in call_args


class TestDatabaseErrorHandling:
    """Test database error handling."""

    @pytest.mark.asyncio
    async def test_verify_schema_connection_timeout(self):
        """Handles connection timeout during schema verification."""
        mock_conn = AsyncMock(spec=asyncpg.Connection)
        mock_conn.execute = AsyncMock(side_effect=asyncpg.PostgresConnectionError("timeout"))
        mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_conn.__aexit__ = AsyncMock(return_value=None)

        mock_pool = MagicMock(spec=asyncpg.Pool)
        mock_pool.acquire.return_value = mock_conn

        with pytest.raises(asyncpg.PostgresConnectionError):
            await verify_schema(mock_pool)

    @pytest.mark.asyncio
    async def test_init_pool_invalid_url(self, test_settings):
        """Handles invalid database URL."""
        test_settings.database_url = "not-a-valid-url"

        with patch("asyncpg.create_pool", side_effect=ValueError("Invalid URL")):
            with pytest.raises(ValueError):
                await init_pool()


class TestDatabaseEdgeCases:
    """Test edge cases and boundary conditions."""

    @pytest.mark.asyncio
    async def test_get_pool_race_condition(self, test_settings):
        """Handles concurrent pool access."""
        mock_pool = MagicMock(spec=asyncpg.Pool)

        with patch("asyncpg.create_pool", return_value=mock_pool):
            await init_pool()

            # Simulate concurrent access
            import asyncio
            results = await asyncio.gather(
                get_pool(),
                get_pool(),
                get_pool()
            )

            # All should return the same pool
            assert all(r == mock_pool for r in results)

    @pytest.mark.asyncio
    async def test_verify_schema_with_custom_query(self):
        """Schema verification runs expected query."""
        mock_conn = AsyncMock(spec=asyncpg.Connection)
        mock_conn.execute = AsyncMock()
        mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_conn.__aexit__ = AsyncMock(return_value=None)

        mock_pool = MagicMock(spec=asyncpg.Pool)
        mock_pool.acquire.return_value = mock_conn

        await verify_schema(mock_pool)

        # Verify SELECT 1 was called (simple health check)
        assert mock_conn.execute.called
        call_args = mock_conn.execute.call_args[0]
        assert "SELECT 1" in call_args

    @pytest.mark.asyncio
    async def test_pool_reinitialization(self, test_settings):
        """Can reinitialize pool after close."""
        mock_pool1 = MagicMock(spec=asyncpg.Pool)
        mock_pool2 = MagicMock(spec=asyncpg.Pool)

        with patch("asyncpg.create_pool", side_effect=[mock_pool1, mock_pool2]):
            # First initialization
            pool1 = await init_pool()
            assert pool1 == mock_pool1

            # Reinitialize (simulating app restart)
            pool2 = await init_pool()
            assert pool2 == mock_pool2