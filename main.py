"""FastAPI application factory for a formulation of truth."""

import base64
import secrets
from contextlib import asynccontextmanager

from fastapi import FastAPI, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.auth import router as auth_router
from app.captcha import (
    generate_captcha,
    is_token_expired,
    render_captcha_png,
    verify_captcha,
    CAPTCHA_LEN,
)
from app.crypto import generate_csrf_token
from app.config import settings
from app.db import init_pool, verify_schema
from app.gate import router as gate_router
from app.lotto import router as lotto_router
from app.middleware import CSRF_COOKIE, SecurityHeadersMiddleware, set_csrf_cookie


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    app.state.pool = await init_pool()
    await verify_schema(app.state.pool)
    yield
    # Shutdown
    await app.state.pool.close()


app = FastAPI(
    title="a formulation of truth",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
    lifespan=lifespan,
)

app.add_middleware(SecurityHeadersMiddleware)

app.mount("/static", StaticFiles(directory="app/static"), name="static")

templates = Jinja2Templates(directory="app/templates")
templates.env.globals["LOTTO_ENABLED"] = settings.lotto_enabled

ADMITTED_COOKIE = "_admitted"


def _is_admitted(request: Request) -> bool:
    """Check if visitor has solved the captcha."""
    return request.cookies.get(ADMITTED_COOKIE) == "1"


def _fresh_captcha_response(
    request: Request,
    error: str = "",
) -> HTMLResponse:
    """Generate a brand-new captcha and return the HTML response."""
    answer, token = generate_captcha()
    png = render_captcha_png(answer)
    csrf = generate_csrf_token()

    captcha_b64 = base64.b64encode(png).decode()

    resp = templates.TemplateResponse(
        request,
        "waiting.html",
        {
            "captcha_b64": captcha_b64,
            "captcha_token": token,
            "csrf_token": csrf,
            "captcha_len": CAPTCHA_LEN,
            "error": error,
        },
    )
    set_csrf_cookie(resp, csrf)
    return resp


@app.get("/", response_class=HTMLResponse)
async def waiting_room(request: Request):
    if _is_admitted(request):
        return RedirectResponse("/gate", status_code=303)
    return _fresh_captcha_response(request)


@app.post("/", response_class=HTMLResponse)
async def waiting_room_submit(
    request: Request,
    captcha_answer: str = Form(""),
    captcha_token: str = Form(""),
    csrf_token: str = Form(""),
):
    # CSRF check
    cookie_csrf = request.cookies.get(CSRF_COOKIE)
    if not cookie_csrf or not secrets.compare_digest(cookie_csrf, csrf_token):
        return RedirectResponse("/", status_code=303)

    # TTL check
    if is_token_expired(captcha_token):
        return _fresh_captcha_response(request, error="Session expired. Try again.")

    # Verify the full answer
    if verify_captcha(captcha_answer, captcha_token):
        response = RedirectResponse("/gate", status_code=303)
        response.set_cookie(
            ADMITTED_COOKIE,
            "1",
            httponly=True,
            secure=True,
            samesite="lax",
            max_age=86400,
            path="/",
        )
        return response

    # Wrong — regenerate
    return _fresh_captcha_response(request, error="Incorrect. Try again.")


app.include_router(auth_router)
app.include_router(gate_router)
if settings.lotto_enabled:
    app.include_router(lotto_router)
