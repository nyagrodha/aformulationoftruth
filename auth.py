"""Authentication routes: register, login, logout with ZK email + Argon2id."""

import json
import secrets

import asyncpg
from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, Form, Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from app.config import settings
from app.crypto import (
    generate_csrf_token,
    generate_token,
    hash_password,
    hmac_email,
    verify_password,
)
from app.db import get_pool
from app.middleware import (
    CSRF_COOKIE,
    CSRF_FIELD,
    check_rate_limit,
    set_csrf_cookie,
)

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")

SESSION_COOKIE = "sid"


def _fernet() -> Fernet:
    return Fernet(settings.session_secret.encode())


def _set_session_cookie(response: Response, sid: str) -> None:
    encrypted = _fernet().encrypt(sid.encode()).decode()
    response.set_cookie(
        SESSION_COOKIE,
        encrypted,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=settings.session_max_age,
        path="/",
    )


def _read_session_cookie(request: Request) -> str | None:
    raw = request.cookies.get(SESSION_COOKIE)
    if not raw:
        return None
    try:
        return _fernet().decrypt(raw.encode()).decode()
    except (InvalidToken, Exception):
        return None


async def get_current_user(
    request: Request, pool: asyncpg.Pool = Depends(get_pool)
) -> dict | None:
    """
    Auth dependency. Returns user dict or None.
    Validates session expiry and session_version match.
    """
    sid = _read_session_cookie(request)
    if not sid:
        return None

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT s.sid, s.user_id, s.session_version AS sess_ver,
                   s.csrf_token, s.question_order_seed, s.current_question,
                   s.answers, s.expires_at,
                   u.session_version AS user_ver
            FROM sessions s
            JOIN zk_users u ON u.id = s.user_id
            WHERE s.sid = $1 AND s.expires_at > now()
            """,
            sid,
        )

    if not row:
        return None

    # Session versioning: if user bumped their version, invalidate
    if row["sess_ver"] != row["user_ver"]:
        return None

    return dict(row)


async def require_auth(
    request: Request, pool: asyncpg.Pool = Depends(get_pool)
) -> dict:
    """Same as get_current_user but redirects to /login if unauthenticated."""
    user = await get_current_user(request, pool)
    if not user:
        return RedirectResponse("/login", status_code=303)
    return user


# ── Register ──────────────────────────────────────────────────────


@router.get("/register", response_class=HTMLResponse)
async def register_form(request: Request):
    csrf = generate_csrf_token()
    resp = templates.TemplateResponse(
        request, "register.html", {"csrf_token": csrf}
    )
    set_csrf_cookie(resp, csrf)
    return resp


@router.post("/register")
async def register_submit(
    request: Request,
    email: str = Form(...),
    password: str = Form(...),
    csrf_token: str = Form(..., alias=CSRF_FIELD),
    pool: asyncpg.Pool = Depends(get_pool),
):
    # CSRF check
    cookie_csrf = request.cookies.get(CSRF_COOKIE)
    if not cookie_csrf or not secrets.compare_digest(cookie_csrf, csrf_token):
        return templates.TemplateResponse(
            request,
            "register.html",
            {"error": "Invalid request. Please try again.", "csrf_token": generate_csrf_token()},
            status_code=403,
        )

    # Rate limit
    if not await check_rate_limit(request):
        return templates.TemplateResponse(
            request,
            "register.html",
            {"error": "Too many attempts. Wait and try again.", "csrf_token": generate_csrf_token()},
            status_code=429,
        )

    # Validate
    email = email.strip()
    if not email or "@" not in email:
        csrf = generate_csrf_token()
        resp = templates.TemplateResponse(
            request,
            "register.html",
            {"error": "Valid email required.", "csrf_token": csrf},
            status_code=400,
        )
        set_csrf_cookie(resp, csrf)
        return resp

    if len(password) < 8:
        csrf = generate_csrf_token()
        resp = templates.TemplateResponse(
            request,
            "register.html",
            {"error": "Password must be at least 8 characters.", "csrf_token": csrf},
            status_code=400,
        )
        set_csrf_cookie(resp, csrf)
        return resp

    # ZK: HMAC email, hash password
    eh = hmac_email(email)
    ph = hash_password(password)

    async with pool.acquire() as conn:
        try:
            user_row = await conn.fetchrow(
                """
                INSERT INTO zk_users (email_hmac, password_hash)
                VALUES ($1, $2)
                RETURNING id, session_version
                """,
                eh,
                ph,
            )
        except asyncpg.UniqueViolationError:
            csrf = generate_csrf_token()
            resp = templates.TemplateResponse(
                request,
                "register.html",
                {"error": "Account already exists.", "csrf_token": csrf},
                status_code=409,
            )
            set_csrf_cookie(resp, csrf)
            return resp

    # Create session
    sid = generate_token()
    csrf = generate_csrf_token()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO sessions (sid, user_id, session_version, csrf_token)
            VALUES ($1, $2, $3, $4)
            """,
            sid,
            user_row["id"],
            user_row["session_version"],
            csrf,
        )

    response = RedirectResponse("/gate", status_code=303)
    _set_session_cookie(response, sid)
    return response


# ── Login ─────────────────────────────────────────────────────────


@router.get("/login", response_class=HTMLResponse)
async def login_form(request: Request):
    csrf = generate_csrf_token()
    resp = templates.TemplateResponse(
        request, "login.html", {"csrf_token": csrf}
    )
    set_csrf_cookie(resp, csrf)
    return resp


@router.post("/login")
async def login_submit(
    request: Request,
    email: str = Form(...),
    password: str = Form(...),
    csrf_token: str = Form(..., alias=CSRF_FIELD),
    pool: asyncpg.Pool = Depends(get_pool),
):
    # CSRF check
    cookie_csrf = request.cookies.get(CSRF_COOKIE)
    if not cookie_csrf or not secrets.compare_digest(cookie_csrf, csrf_token):
        return templates.TemplateResponse(
            request,
            "login.html",
            {"error": "Invalid request. Please try again.", "csrf_token": generate_csrf_token()},
            status_code=403,
        )

    # Rate limit
    if not await check_rate_limit(request):
        return templates.TemplateResponse(
            request,
            "login.html",
            {"error": "Too many attempts. Wait and try again.", "csrf_token": generate_csrf_token()},
            status_code=429,
        )

    # Generic error for both "not found" and "wrong password"
    bad_creds_msg = "Invalid credentials."

    eh = hmac_email(email.strip())
    async with pool.acquire() as conn:
        user_row = await conn.fetchrow(
            "SELECT id, password_hash, session_version FROM zk_users WHERE email_hmac = $1",
            eh,
        )

    if not user_row:
        # Constant-time: still run a hash to prevent timing attacks
        hash_password("dummy-to-equalize-timing")
        csrf = generate_csrf_token()
        resp = templates.TemplateResponse(
            request, "login.html",
            {"error": bad_creds_msg, "csrf_token": csrf},
            status_code=401,
        )
        set_csrf_cookie(resp, csrf)
        return resp

    if not verify_password(password, user_row["password_hash"]):
        csrf = generate_csrf_token()
        resp = templates.TemplateResponse(
            request, "login.html",
            {"error": bad_creds_msg, "csrf_token": csrf},
            status_code=401,
        )
        set_csrf_cookie(resp, csrf)
        return resp

    # Create session
    sid = generate_token()
    csrf = generate_csrf_token()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO sessions (sid, user_id, session_version, csrf_token)
            VALUES ($1, $2, $3, $4)
            """,
            sid,
            user_row["id"],
            user_row["session_version"],
            csrf,
        )

    response = RedirectResponse("/gate", status_code=303)
    _set_session_cookie(response, sid)
    return response


# ── Logout ────────────────────────────────────────────────────────


@router.get("/logout")
async def logout(
    request: Request, pool: asyncpg.Pool = Depends(get_pool)
):
    sid = _read_session_cookie(request)
    if sid:
        async with pool.acquire() as conn:
            await conn.execute("DELETE FROM sessions WHERE sid = $1", sid)

    response = RedirectResponse("/login", status_code=303)
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie(CSRF_COOKIE, path="/")
    return response
