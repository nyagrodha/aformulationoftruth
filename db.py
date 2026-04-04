"""asyncpg connection pool, attached to app.state via FastAPI lifespan."""

import asyncpg
from fastapi import Request

from app.config import settings


async def init_pool() -> asyncpg.Pool:
    return await asyncpg.create_pool(
        settings.database_url,
        min_size=2,
        max_size=10,
    )


def get_pool(request: Request) -> asyncpg.Pool:
    """FastAPI dependency — pulls pool from app.state."""
    return request.app.state.pool


async def verify_schema(pool: asyncpg.Pool) -> None:
    """Verify required tables exist (schema is pre-created by DBA)."""
    async with pool.acquire() as conn:
        tables = await conn.fetch(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
        )
        found = {r["tablename"] for r in tables}
        required = {"zk_users", "sessions", "gate_submissions", "rate_limits"}
        missing = required - found
        if missing:
            raise RuntimeError(f"Missing tables in a4m_gate: {missing}")
