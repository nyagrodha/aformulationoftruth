"""Authentication: login, register, sessions, shared auth header injection.

Session cookie is Fernet-encrypted JSON containing {sid, user_id}.
The same session grants access to both the gate/questionnaire and the
fridge-rs storefront (via X-Gate-User trusted header on proxied requests).
"""

import json
import logging
import secrets

import asyncpg
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from app.config import settings
from app.crypto import generate_csrf_token
from app.db import get_pool
from app.middleware import CSRF_COOKIE, CSRF_FIELD, set_csrf_cookie

log = logging.getLogger(__name__)

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")

SESSION_COOKIE = "_session"

_ph = PasswordHasher()

# ── Handle generation word lists ────────────────────────────────────────

_ADJECTIVES = [
    "quiet", "bright", "cold", "warm", "swift", "slow", "sharp", "soft",
    "dark", "pale", "deep", "wild", "calm", "bold", "lost", "free",
    "tired", "awake", "frozen", "burnt", "hollow", "dense", "thin",
    "late", "early", "dry", "damp", "raw", "clean", "rough",
]

_NOUNS = [
    "river", "stone", "cloud", "flame", "dust", "bone", "root", "salt",
    "moth", "crane", "fox", "owl", "crow", "wolf", "hare", "finch",
    "moss", "bark", "ash", "thorn", "reed", "fern", "vine", "oak",
    "shore", "peak", "cave", "well", "dusk", "dawn",
]


def _generate_random_handle() -> str:
    """Generate a pseudonymous handle like 'quiet-river-7382'."""
    adj = secrets.choice(_ADJECTIVES)
    noun = secrets.choice(_NOUNS)
    num = secrets.randbelow(9000) + 1000
    return f"{adj}-{noun}-{num}"


# ── Fernet session encryption ───────────────────────────────────────────


def _get_fernet() -> Fernet:
    key = settings.session_secret
    if not key:
        raise RuntimeError("SESSION_SECRET (Fernet key) is not configured")
    return Fernet(key.encode() if isinstance(key, str) else key)


def _encrypt_session(data: dict) -> str:
    return _get_fernet().encrypt(json.dumps(data).encode()).decode("ascii")


def _decrypt_session(token: str) -> dict | None:
    try:
        plaintext = _get_fernet().decrypt(
            token.encode(), ttl=settings.session_max_age
        )
        return json.loads(plaintext)
    except (InvalidToken, json.JSONDecodeError, Exception):
        return None


# ── Public helpers ──────────────────────────────────────────────────────


def _read_session_cookie(request: Request) -> dict | None:
    """Decrypt the session cookie, returning {sid, user_id} or None."""
    raw = request.cookies.get(SESSION_COOKIE)
    if not raw:
        return None
    return _decrypt_session(raw)


async def get_current_user(
    request: Request,
    pool: asyncpg.Pool = Depends(get_pool),
) -> dict | None:
    """Decrypt cookie → look up session row → return user dict.

    Returns a dict with user fields plus session fields (answers, seed, etc.)
    or None if not authenticated.
    """
    session_data = _read_session_cookie(request)
    if not session_data:
        return None

    sid = session_data.get("sid")
    user_id = session_data.get("user_id")
    if not sid or not user_id:
        return None

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT s.sid, s.csrf_token, s.question_order_seed,
                   s.current_question, s.answers, s.expires_at,
                   u.id, u.handle, u.is_admin, u.created_at
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.sid = $1 AND s.user_id = $2
              AND s.expires_at > now()
            """,
            sid,
            user_id,
        )

    if not row:
        return None

    return {
        "sid": row["sid"],
        "user_id": row["id"],
        "handle": row["handle"],
        "is_admin": row["is_admin"],
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        "csrf_token": row["csrf_token"],
        "question_order_seed": row["question_order_seed"],
        "current_question": row["current_question"],
        "answers": row["answers"],
    }


# ── CSRF helper ─────────────────────────────────────────────────────────


def _csrf_ok(request: Request, form_token: str) -> bool:
    cookie_csrf = request.cookies.get(CSRF_COOKIE)
    return bool(cookie_csrf and secrets.compare_digest(cookie_csrf, form_token))


# ── Session creation helper ─────────────────────────────────────────────


async def _create_session(
    conn: asyncpg.Connection, user_id: int
) -> tuple[str, str]:
    """Create a DB session row and return (sid, encrypted_cookie)."""
    sid = secrets.token_urlsafe(32)
    await conn.execute(
        """
        INSERT INTO sessions (sid, user_id)
        VALUES ($1, $2)
        """,
        sid,
        user_id,
    )
    cookie_value = _encrypt_session({"sid": sid, "user_id": user_id})
    return sid, cookie_value


def _set_session_cookie(response, cookie_value: str):
    response.set_cookie(
        SESSION_COOKIE,
        cookie_value,
        httponly=True,
        secure=False,  # .onion serves HTTP
        samesite="lax",
        max_age=settings.session_max_age,
        path="/",
    )


# ── Routes ──────────────────────────────────────────────────────────────


@router.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    csrf = generate_csrf_token()
    resp = templates.TemplateResponse(
        request, "login.html", {"csrf_token": csrf, "error": ""}
    )
    set_csrf_cookie(resp, csrf)
    return resp


@router.post("/login", response_class=HTMLResponse)
async def login_submit(
    request: Request,
    handle: str = Form(""),
    password: str = Form(""),
    csrf_token: str = Form("", alias=CSRF_FIELD),
    pool: asyncpg.Pool = Depends(get_pool),
):
    if not _csrf_ok(request, csrf_token):
        return RedirectResponse("/login", status_code=303)

    handle = handle.strip().lower()
    if not handle or not password:
        csrf = generate_csrf_token()
        resp = templates.TemplateResponse(
            request, "login.html",
            {"csrf_token": csrf, "error": "Handle and password are required."},
        )
        set_csrf_cookie(resp, csrf)
        return resp

    async with pool.acquire() as conn:
        user = await conn.fetchrow(
            "SELECT id, handle, password_hash FROM users WHERE handle = $1",
            handle,
        )

    if not user:
        csrf = generate_csrf_token()
        resp = templates.TemplateResponse(
            request, "login.html",
            {"csrf_token": csrf, "error": "Invalid handle or password."},
        )
        set_csrf_cookie(resp, csrf)
        return resp

    try:
        _ph.verify(user["password_hash"], password)
    except VerifyMismatchError:
        csrf = generate_csrf_token()
        resp = templates.TemplateResponse(
            request, "login.html",
            {"csrf_token": csrf, "error": "Invalid handle or password."},
        )
        set_csrf_cookie(resp, csrf)
        return resp

    # Rehash if argon2 params changed
    if _ph.check_needs_rehash(user["password_hash"]):
        new_hash = _ph.hash(password)
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE users SET password_hash = $1 WHERE id = $2",
                new_hash, user["id"],
            )

    async with pool.acquire() as conn:
        _, cookie_value = await _create_session(conn, user["id"])

    response = RedirectResponse("/gate", status_code=303)
    _set_session_cookie(response, cookie_value)
    return response


@router.get("/register", response_class=HTMLResponse)
async def register_page(request: Request):
    csrf = generate_csrf_token()
    resp = templates.TemplateResponse(
        request, "register.html",
        {"csrf_token": csrf, "error": "", "suggested_handle": _generate_random_handle()},
    )
    set_csrf_cookie(resp, csrf)
    return resp


@router.get("/register/random")
async def random_handle():
    """Return a random pseudonymous handle suggestion."""
    return {"handle": _generate_random_handle()}


@router.post("/register", response_class=HTMLResponse)
async def register_submit(
    request: Request,
    handle: str = Form(""),
    password: str = Form(""),
    csrf_token: str = Form("", alias=CSRF_FIELD),
    pool: asyncpg.Pool = Depends(get_pool),
):
    if not _csrf_ok(request, csrf_token):
        return RedirectResponse("/register", status_code=303)

    handle = handle.strip().lower()
    error = ""

    if not handle or len(handle) < 3:
        error = "Handle must be at least 3 characters."
    elif len(handle) > 32:
        error = "Handle must be at most 32 characters."
    elif not all(c.isalnum() or c in "-_" for c in handle):
        error = "Handle may only contain letters, digits, hyphens, underscores."
    elif not password or len(password) < 12:
        error = "Password must be at least 12 characters."

    if error:
        csrf = generate_csrf_token()
        resp = templates.TemplateResponse(
            request, "register.html",
            {"csrf_token": csrf, "error": error, "suggested_handle": _generate_random_handle()},
        )
        set_csrf_cookie(resp, csrf)
        return resp

    password_hash = _ph.hash(password)

    async with pool.acquire() as conn:
        try:
            user_id = await conn.fetchval(
                """
                INSERT INTO users (handle, password_hash)
                VALUES ($1, $2)
                RETURNING id
                """,
                handle,
                password_hash,
            )
        except asyncpg.UniqueViolationError:
            csrf = generate_csrf_token()
            resp = templates.TemplateResponse(
                request, "register.html",
                {"csrf_token": csrf, "error": "That handle is already taken.",
                 "suggested_handle": _generate_random_handle()},
            )
            set_csrf_cookie(resp, csrf)
            return resp

        _, cookie_value = await _create_session(conn, user_id)

    response = RedirectResponse("/gate", status_code=303)
    _set_session_cookie(response, cookie_value)
    return response


@router.post("/logout")
async def logout_submit(
    request: Request,
    pool: asyncpg.Pool = Depends(get_pool),
):
    session_data = _read_session_cookie(request)
    if session_data and session_data.get("sid"):
        async with pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM sessions WHERE sid = $1",
                session_data["sid"],
            )

    response = RedirectResponse("/", status_code=303)
    response.delete_cookie(SESSION_COOKIE, path="/")
    return response


@router.get("/logout")
async def logout_page(request: Request, pool: asyncpg.Pool = Depends(get_pool)):
    """GET /logout convenience — same as POST."""
    return await logout_submit(request, pool)
