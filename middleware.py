"""Security middleware: headers, rate limiting, CSRF, PII scrubbing."""

import math
import time

import asyncpg
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from app.config import settings

# ── Security headers ──────────────────────────────────────────────

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'self'; img-src 'self' data:",
    "X-XSS-Protection": "0",
    "Permissions-Policy": "interest-cohort=()",
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        response = await call_next(request)
        for k, v in SECURITY_HEADERS.items():
            response.headers[k] = v
        return response


# ── Postgres-backed rate limiting ─────────────────────────────────

AUTH_PATHS = {"/login", "/register"}


def _rate_limit_key(request: Request) -> str:
    """Composite key: session cookie if present, else client token cookie."""
    sid = request.cookies.get("sid", "")
    if sid:
        return f"sid:{sid[:16]}"
    ct = request.cookies.get("_ct", "")
    if ct:
        return f"ct:{ct[:16]}"
    # Last resort: peer IP (limited value behind Tor, but better than nothing)
    client = request.client
    ip = client.host if client else "unknown"
    return f"ip:{ip}"


async def check_rate_limit(request: Request) -> bool:
    """
    Check and increment rate limit. Returns True if allowed, False if blocked.
    Uses fixed-window buckets in Postgres.
    """
    pool: asyncpg.Pool = request.app.state.pool
    key = _rate_limit_key(request)
    window = settings.rate_limit_window
    max_req = settings.rate_limit_max

    # Truncate current time to window boundary
    now = time.time()
    window_start = math.floor(now / window) * window

    async with pool.acquire() as conn:
        # Upsert: increment counter or insert new row
        row = await conn.fetchrow(
            """
            INSERT INTO rate_limits (key, window_start, count)
            VALUES ($1, to_timestamp($2), 1)
            ON CONFLICT (key, window_start)
            DO UPDATE SET count = rate_limits.count + 1
            RETURNING count
            """,
            key,
            float(window_start),
        )
        # Lazy cleanup of old windows (don't block on this)
        await conn.execute(
            "DELETE FROM rate_limits WHERE window_start < to_timestamp($1)",
            float(window_start - window * 2),
        )

    return row is not None and row["count"] <= max_req


# ── CSRF (double-submit cookie, zero JS) ─────────────────────────

CSRF_COOKIE = "_csrf"
CSRF_FIELD = "csrf_token"
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def get_csrf_from_request(request: Request) -> tuple[str | None, str | None]:
    """Extract CSRF token from cookie and form body is handled in routes."""
    cookie_val = request.cookies.get(CSRF_COOKIE)
    return cookie_val


def set_csrf_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        CSRF_COOKIE,
        token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=settings.session_max_age,
        path="/",
    )
