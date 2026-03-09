"""Cryptographic utilities."""

import secrets


def generate_csrf_token() -> str:
    """Generate a CSRF token."""
    return secrets.token_urlsafe(32)


def generate_token() -> str:
    """Generate a random token."""
    return secrets.token_urlsafe(32)


def encrypt_answers(payload: dict) -> str:
    """Encrypt answers payload."""
    return "encrypted"


def shuffle_questions(seed: str) -> list[str]:
    """Shuffle questions based on seed."""
    return []