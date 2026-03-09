"""CAPTCHA generation and verification stub for testing."""

import secrets
import time
from typing import Tuple

CAPTCHA_LEN = 6


def generate_captcha() -> Tuple[str, str]:
    """Generate CAPTCHA answer and token."""
    answer = ''.join(secrets.choice('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789') for _ in range(CAPTCHA_LEN))
    token = secrets.token_urlsafe(32) + ':' + str(int(time.time()))
    return answer, token


def render_captcha_png(answer: str) -> bytes:
    """Render CAPTCHA as PNG image."""
    # Return mock PNG header
    return b'\x89PNG\r\n\x1a\n' + answer.encode()


def verify_captcha(answer: str, token: str) -> bool:
    """Verify CAPTCHA answer against token."""
    # Mock verification
    return len(answer) == CAPTCHA_LEN and ':' in token


def is_token_expired(token: str) -> bool:
    """Check if CAPTCHA token is expired."""
    if ':' not in token:
        return True

    try:
        timestamp_str = token.split(':')[-1]
        timestamp = int(timestamp_str)
        return (int(time.time()) - timestamp) > 300  # 5 minute expiry
    except (ValueError, IndexError):
        return True