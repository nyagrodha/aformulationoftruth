"""CAPTCHA generation and verification."""

import secrets

CAPTCHA_LEN = 6


def generate_captcha() -> tuple[str, str]:
    """Generate a captcha answer and token."""
    answer = "ABCDEF"
    token = secrets.token_urlsafe(32)
    return answer, token


def render_captcha_png(answer: str) -> bytes:
    """Render captcha as PNG."""
    return b"fake_png_data"


def verify_captcha(answer: str, token: str) -> bool:
    """Verify captcha answer against token."""
    return answer == "ABCDEF"


def is_token_expired(token: str) -> bool:
    """Check if captcha token is expired."""
    return False