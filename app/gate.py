"""Questionnaire routes: consent, question flow, submission."""

import json
import secrets

import asyncpg
from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from app.auth import (
    SESSION_COOKIE,
    _read_session_cookie,
    get_current_user,
)
from app.crypto import encrypt_answers, generate_csrf_token, generate_token, shuffle_questions
from app.db import get_pool
from app.middleware import CSRF_COOKIE, CSRF_FIELD, set_csrf_cookie
from app.questions import GATE_QUESTIONS, MAIN_QUESTIONS, QUESTIONS, TOTAL_QUESTIONS

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")


def _require_user(user: dict | None):
    """Redirect to login if no user."""
    if user is None or isinstance(user, RedirectResponse):
        return None
    return user


def _csrf_ok(request: Request, form_token: str) -> bool:
    cookie_csrf = request.cookies.get(CSRF_COOKIE)
    return bool(cookie_csrf and secrets.compare_digest(cookie_csrf, form_token))


# ── Gate landing (consent) ────────────────────────────────────────


@router.get("/gate", response_class=HTMLResponse)
async def gate_landing(
    request: Request,
    pool: asyncpg.Pool = Depends(get_pool),
):
    user = await get_current_user(request, pool)
    if not user:
        return RedirectResponse("/login", status_code=303)

    csrf = generate_csrf_token()
    resp = templates.TemplateResponse(
        request,
        "gate.html",
        {
            "csrf_token": csrf,
            "gate_questions": GATE_QUESTIONS,
            "total_questions": TOTAL_QUESTIONS,
        },
    )
    set_csrf_cookie(resp, csrf)
    return resp


# ── Start questionnaire ──────────────────────────────────────────


@router.post("/gate/start")
async def gate_start(
    request: Request,
    csrf_token: str = Form(..., alias=CSRF_FIELD),
    pool: asyncpg.Pool = Depends(get_pool),
):
    user = await get_current_user(request, pool)
    if not user:
        return RedirectResponse("/login", status_code=303)

    if not _csrf_ok(request, csrf_token):
        return RedirectResponse("/gate", status_code=303)

    # Generate deterministic question order for this session
    seed = generate_token()

    async with pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE sessions
            SET question_order_seed = $1,
                current_question = 1,
                answers = '{}'::jsonb
            WHERE sid = $2
            """,
            seed,
            user["sid"],
        )

    return RedirectResponse("/gate/q/1", status_code=303)


# ── Question view ─────────────────────────────────────────────────


def _get_question_for_position(position: int, seed: str):
    """
    Map 1-based position to a question.
    Positions 1-2 are gate questions (fixed order).
    Positions 3-35 are main questions (shuffled by seed).
    """
    if position <= len(GATE_QUESTIONS):
        return GATE_QUESTIONS[position - 1]

    main_index = position - len(GATE_QUESTIONS) - 1
    shuffled_ids = shuffle_questions(seed)
    if main_index >= len(shuffled_ids):
        return None
    qid = shuffled_ids[main_index]
    return next((q for q in QUESTIONS if q.id == qid), None)


@router.get("/gate/q/{n}", response_class=HTMLResponse)
async def question_view(
    request: Request,
    n: int,
    pool: asyncpg.Pool = Depends(get_pool),
):
    user = await get_current_user(request, pool)
    if not user:
        return RedirectResponse("/login", status_code=303)

    seed = user.get("question_order_seed")
    if not seed:
        return RedirectResponse("/gate", status_code=303)

    if n < 1 or n > TOTAL_QUESTIONS:
        return RedirectResponse("/gate", status_code=303)

    question = _get_question_for_position(n, seed)
    if not question:
        return RedirectResponse("/gate", status_code=303)

    # Get existing answer if going back
    answers = user.get("answers") or {}
    if isinstance(answers, str):
        answers = json.loads(answers)
    existing_answer = answers.get(str(question.id), "")

    csrf = generate_csrf_token()

    # Update session CSRF
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE sessions SET csrf_token = $1 WHERE sid = $2",
            csrf,
            user["sid"],
        )

    resp = templates.TemplateResponse(
        request,
        "question.html",
        {
            "question": question,
            "position": n,
            "total": TOTAL_QUESTIONS,
            "csrf_token": csrf,
            "existing_answer": existing_answer,
            "is_last": n == TOTAL_QUESTIONS,
        },
    )
    set_csrf_cookie(resp, csrf)
    return resp


# ── Answer submission ─────────────────────────────────────────────


@router.post("/gate/q/{n}")
async def question_submit(
    request: Request,
    n: int,
    answer: str = Form(""),
    csrf_token: str = Form(..., alias=CSRF_FIELD),
    pool: asyncpg.Pool = Depends(get_pool),
):
    user = await get_current_user(request, pool)
    if not user:
        return RedirectResponse("/login", status_code=303)

    if not _csrf_ok(request, csrf_token):
        return RedirectResponse(f"/gate/q/{n}", status_code=303)

    seed = user.get("question_order_seed")
    if not seed:
        return RedirectResponse("/gate", status_code=303)

    question = _get_question_for_position(n, seed)
    if not question:
        return RedirectResponse("/gate", status_code=303)

    answer_text = answer.strip()

    # Atomic read-modify-write with row lock to prevent stale overwrites
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "SELECT answers FROM sessions WHERE sid = $1 FOR UPDATE",
                user["sid"],
            )
            if not row:
                return RedirectResponse("/login", status_code=303)

            answers = row["answers"] or {}
            if isinstance(answers, str):
                answers = json.loads(answers)

            if answer_text:
                answers[str(question.id)] = answer_text
            else:
                answers.pop(str(question.id), None)

            await conn.execute(
                """
                UPDATE sessions
                SET answers = $1::jsonb, current_question = $2
                WHERE sid = $3
                """,
                json.dumps(answers, ensure_ascii=False),
                n + 1,
                user["sid"],
            )

    # Redirect to next question or submission
    if n >= TOTAL_QUESTIONS:
        return RedirectResponse("/gate/submit", status_code=303)
    return RedirectResponse(f"/gate/q/{n + 1}", status_code=303)


# ── Final submission ──────────────────────────────────────────────


@router.get("/gate/submit", response_class=HTMLResponse)
async def submit_confirm(
    request: Request,
    pool: asyncpg.Pool = Depends(get_pool),
):
    """Show confirmation page before final submit."""
    user = await get_current_user(request, pool)
    if not user:
        return RedirectResponse("/login", status_code=303)

    answers = user.get("answers") or {}
    if isinstance(answers, str):
        answers = json.loads(answers)

    answered_count = len(answers)

    csrf = generate_csrf_token()
    resp = templates.TemplateResponse(
        request,
        "submit.html",
        {
            "csrf_token": csrf,
            "answered_count": answered_count,
            "total": TOTAL_QUESTIONS,
        },
    )
    set_csrf_cookie(resp, csrf)
    return resp


@router.post("/gate/submit")
async def submit_final(
    request: Request,
    csrf_token: str = Form(..., alias=CSRF_FIELD),
    pool: asyncpg.Pool = Depends(get_pool),
):
    user = await get_current_user(request, pool)
    if not user:
        return RedirectResponse("/login", status_code=303)

    if not _csrf_ok(request, csrf_token):
        return RedirectResponse("/gate/submit", status_code=303)

    # Atomic: lock session, read answers, encrypt, store, clear — all in one tx
    gate_token = generate_token()

    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "SELECT answers, question_order_seed FROM sessions WHERE sid = $1 FOR UPDATE",
                user["sid"],
            )
            if not row:
                return RedirectResponse("/login", status_code=303)

            answers = row["answers"] or {}
            if isinstance(answers, str):
                answers = json.loads(answers)

            if not answers:
                return RedirectResponse("/gate", status_code=303)

            seed = row["question_order_seed"] or ""
            payload = {
                "answers": answers,
                "question_order_seed": seed,
                "question_count": len(answers),
            }

            encrypted = encrypt_answers(payload)

            await conn.execute(
                """
                INSERT INTO gate_submissions (gate_token, encrypted_payload, question_count)
                VALUES ($1, $2, $3)
                """,
                gate_token,
                encrypted,
                len(answers),
            )

            await conn.execute(
                """
                UPDATE sessions
                SET answers = '{}'::jsonb, question_order_seed = NULL, current_question = 0
                WHERE sid = $1
                """,
                user["sid"],
            )

    return RedirectResponse(f"/gate/complete?token={gate_token}", status_code=303)


# ── Completion ────────────────────────────────────────────────────


@router.get("/gate/complete", response_class=HTMLResponse)
async def complete_page(
    request: Request,
    token: str = "",
    pool: asyncpg.Pool = Depends(get_pool),
):
    user = await get_current_user(request, pool)
    if not user:
        return RedirectResponse("/login", status_code=303)

    return templates.TemplateResponse(
        request,
        "complete.html",
        {"gate_token": token},
    )
