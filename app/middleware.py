"""Middleware module stub for testing."""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

CSRF_COOKIE = '_csrf'
CSRF_FIELD = 'csrf_token'


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to responses."""

    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        return response


def set_csrf_cookie(response: Response, csrf_token: str) -> None:
    """Set CSRF cookie on response."""
    response.set_cookie(
        CSRF_COOKIE,
        csrf_token,
        httponly=True,
        samesite='lax',
        max_age=3600,
        path='/'
    )