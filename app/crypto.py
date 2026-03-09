"""Cryptographic functions stub for testing."""

import secrets
import hashlib
from typing import Any


def generate_csrf_token() -> str:
    """Generate CSRF token."""
    return secrets.token_urlsafe(32)


def generate_token() -> str:
    """Generate random token."""
    return secrets.token_urlsafe(32)


def shuffle_questions(seed: str) -> list[str]:
    """Shuffle question IDs using seed."""
    # Return deterministic shuffled list based on seed
    base_questions = [f'q{i}' for i in range(1, 34)]
    # Use seed to create reproducible shuffle
    random_gen = hash(seed)
    return sorted(base_questions, key=lambda x: hash(x + str(random_gen)))


def encrypt_answers(payload: dict[str, Any]) -> str:
    """Encrypt answers payload."""
    # Mock encryption - returns JSON string in production would use age encryption
    import json
    return json.dumps(payload)