"""
Cryptographic primitives for zero-knowledge architecture.

- HMAC-SHA256 for email lookups (no plaintext email in DB)
- Argon2id for password hashing
- pyrage for age x25519 encryption of questionnaire responses
- Fisher-Yates shuffle with deterministic seed per session
"""

import hashlib
import hmac
import json
import random
import secrets

import argon2
import pyrage

from app.config import settings
from app.questions import MAIN_QUESTIONS

_password_hasher = argon2.PasswordHasher(
    time_cost=3,
    memory_cost=65536,  # 64 MiB
    parallelism=1,
)


def hmac_email(email: str) -> bytes:
    """HMAC-SHA256 of normalized email. Returns raw bytes for DB storage."""
    normalized = email.strip().lower()
    return hmac.new(
        settings.hmac_secret.encode(),
        normalized.encode(),
        hashlib.sha256,
    ).digest()


def hash_password(password: str) -> str:
    """Argon2id hash. Returns the PHC string."""
    return _password_hasher.hash(password)


def verify_password(password: str, phc_hash: str) -> bool:
    """Verify password against Argon2id hash. Handles rehash-needed."""
    try:
        return _password_hasher.verify(phc_hash, password)
    except argon2.exceptions.VerifyMismatchError:
        return False


def encrypt_payload(plaintext: str) -> bytes:
    """Encrypt plaintext with age x25519 recipient from config."""
    recipient = pyrage.x25519.Recipient.from_str(settings.age_recipient)
    return pyrage.encrypt(plaintext.encode(), [recipient])


def encrypt_answers(answers: dict) -> bytes:
    """Encrypt answers dict as JSON via age."""
    return encrypt_payload(json.dumps(answers, ensure_ascii=False))


def generate_token() -> str:
    """Generate a URL-safe session/gate token."""
    return secrets.token_urlsafe(32)


def generate_csrf_token() -> str:
    """Generate a CSRF token."""
    return secrets.token_urlsafe(32)


def shuffle_questions(seed: str) -> list[int]:
    """
    Fisher-Yates shuffle of main question IDs, deterministic per seed.

    Returns ordered list of question IDs for this session.
    Gate questions (0, 1) are always first, in order.
    """
    ids = [q.id for q in MAIN_QUESTIONS]
    rng = random.Random(seed)
    rng.shuffle(ids)
    return ids
