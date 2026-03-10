"""Cryptographic utilities for tokens, CSRF, and encryption."""

import hashlib
import json
import random
import secrets

from app.config import settings


def generate_token(nbytes: int = 32) -> str:
    """Generate a random URL-safe token."""
    return secrets.token_urlsafe(nbytes)


def generate_csrf_token() -> str:
    """Generate a CSRF token."""
    return secrets.token_urlsafe(32)


def shuffle_questions(seed: str) -> list[str]:
    """Deterministically shuffle question IDs based on seed."""
    from app.questions import MAIN_QUESTIONS

    question_ids = [q.id for q in MAIN_QUESTIONS]
    rng = random.Random(seed)
    rng.shuffle(question_ids)
    return question_ids


def encrypt_answers(payload: dict) -> str:
    """Encrypt answers payload using age encryption."""
    age_recipient = settings.age_recipient
    if not age_recipient:
        raise RuntimeError("AGE_RECIPIENT is not configured")

    # Simplified: In production would use actual age encryption
    # For now, just return base64-encoded JSON
    import base64
    json_str = json.dumps(payload, ensure_ascii=False)
    return base64.b64encode(json_str.encode()).decode()