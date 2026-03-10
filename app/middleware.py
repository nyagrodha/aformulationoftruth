"""Security middleware and CSRF utilities."""

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware


CSRF_COOKIE = "_csrf"
CSRF_FIELD = "csrf_token"


def set_csrf_cookie(response: Response, csrf_token: str) -> None:
    """Set CSRF cookie on response."""
    response.set_cookie(
        CSRF_COOKIE,
        csrf_token,
        httponly=True,
        secure=False,  # .onion serves HTTP
        samesite="lax",
        max_age=86400,
        path="/",
    )


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # Add security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        return response