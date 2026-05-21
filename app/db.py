"""asyncpg connection pool and schema verification for the gate application."""

import logging

import asyncpg
from fastapi import Request

from app.config import settings

log = logging.getLogger(__name__)

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  sid TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token TEXT,
  question_order_seed TEXT,
  current_question INTEGER NOT NULL DEFAULT 0,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '24 hours'
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS gate_submissions (
  id BIGSERIAL PRIMARY KEY,
  gate_token TEXT NOT NULL UNIQUE,
  encrypted_payload TEXT NOT NULL,
  question_count INTEGER NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""


async def init_pool() -> asyncpg.Pool:
    """Connect to PostgreSQL, trying a fallback chain of DSNs."""
    candidates: list[tuple[str, str]] = []
    for attr, label in (
        ("database_url_primary", "primary (VPN)"),
        ("database_url_secondary", "secondary (domain)"),
        ("database_url_local", "local (localhost)"),
        ("database_url", "default"),
    ):
        url = getattr(settings, attr, None)
        if url:
            candidates.append((url, label))

    last_err: Exception | None = None
    for url, label in candidates:
        try:
            log.info("Trying %s database connection ...", label)
            pool = await asyncpg.create_pool(url)
            log.info("Connected via %s", label)
            return pool
        except (asyncpg.PostgresError, OSError, asyncpg.InterfaceError) as exc:
            log.warning("Connection failed for %s: %s", label, exc)
            last_err = exc

    raise RuntimeError("All database connection attempts failed") from last_err


async def verify_schema(pool: asyncpg.Pool) -> None:
    """Ensure the core tables and indexes exist."""
    async with pool.acquire() as conn:
        await conn.execute(_SCHEMA_SQL)
    log.info("Schema verified")


async def get_pool(request: Request) -> asyncpg.Pool:
    """Return the application-wide connection pool."""
    return request.app.state.pool
