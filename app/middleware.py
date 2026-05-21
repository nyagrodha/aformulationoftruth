"""Security headers and CSRF cookie management for .onion gate server."""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

CSRF_COOKIE = "_csrf"
CSRF_FIELD = "csrf_token"


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = (
            "geolocation=(), microphone=(), camera=()"
        )
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
        return response


def set_csrf_cookie(response, token: str):
    """Set an HttpOnly CSRF cookie on the response."""
    response.set_cookie(
        CSRF_COOKIE,
        token,
        httponly=True,
        secure=False,  # .onion serves HTTP
        samesite="lax",
        max_age=86400,
        path="/",
    )
