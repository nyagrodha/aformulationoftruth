"""Database connection module stub for testing."""

import asyncpg


async def init_pool() -> asyncpg.Pool:
    """Initialize database connection pool."""
    return await asyncpg.create_pool(
        'postgresql://localhost/test',
        min_size=1,
        max_size=10
    )


async def get_pool() -> asyncpg.Pool:
    """Get database pool dependency."""
    return await init_pool()


async def verify_schema(pool: asyncpg.Pool) -> None:
    """Verify database schema exists."""
    pass