"""Database connection pool management."""

import asyncpg
from app.config import settings


_pool: asyncpg.Pool | None = None


async def init_pool() -> asyncpg.Pool:
    """Initialize and return database connection pool."""
    global _pool
    _pool = await asyncpg.create_pool(settings.database_url)
    return _pool


async def get_pool() -> asyncpg.Pool:
    """Get the database connection pool."""
    if _pool is None:
        raise RuntimeError("Database pool not initialized")
    return _pool


async def verify_schema(pool: asyncpg.Pool) -> None:
    """Verify required database schema exists."""
    async with pool.acquire() as conn:
        await conn.execute("SELECT 1")