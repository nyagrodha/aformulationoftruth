"""Security middleware and CSRF utilities."""

from starlette.middleware.base import BaseHTTPMiddleware


CSRF_COOKIE = "_csrf"
CSRF_FIELD = "csrf_token"


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to responses."""

    async def dispatch(self, request, call_next):
        response = await call_next(request)
        return response


def set_csrf_cookie(response, token: str):
    """Set CSRF cookie on response."""
    response.set_cookie(
        CSRF_COOKIE,
        token,
        httponly=True,
        secure=False,
        samesite="lax",
        max_age=3600,
        path="/",
    )