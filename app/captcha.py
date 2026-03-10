"""CAPTCHA generation and verification."""

import secrets
import time
from io import BytesIO

from cryptography.fernet import Fernet
from PIL import Image, ImageDraw, ImageFont

from app.config import settings


CAPTCHA_LEN = 6
CAPTCHA_TTL = 300  # 5 minutes


def generate_captcha() -> tuple[str, str]:
    """
    Generate a CAPTCHA answer and encrypted token.

    Returns:
        (answer, token) where answer is the expected text and token is encrypted.
    """
    answer = ''.join(secrets.choice('23456789ABCDEFGHJKLMNPQRSTUVWXYZ') for _ in range(CAPTCHA_LEN))

    # Create token: timestamp:answer
    timestamp = int(time.time())
    payload = f"{timestamp}:{answer}"

    # Encrypt with session secret (reusing Fernet key)
    key = settings.session_secret.encode() if isinstance(settings.session_secret, str) else settings.session_secret
    f = Fernet(key)
    token = f.encrypt(payload.encode()).decode()

    return answer, token


def verify_captcha(user_answer: str, token: str) -> bool:
    """Verify CAPTCHA answer against token."""
    try:
        key = settings.session_secret.encode() if isinstance(settings.session_secret, str) else settings.session_secret
        f = Fernet(key)
        payload = f.decrypt(token.encode()).decode()

        timestamp_str, expected_answer = payload.split(':', 1)
        timestamp = int(timestamp_str)

        # Check TTL
        if time.time() - timestamp > CAPTCHA_TTL:
            return False

        return user_answer.upper().strip() == expected_answer
    except Exception:
        return False


def is_token_expired(token: str) -> bool:
    """Check if CAPTCHA token is expired."""
    try:
        key = settings.session_secret.encode() if isinstance(settings.session_secret, str) else settings.session_secret
        f = Fernet(key)
        payload = f.decrypt(token.encode()).decode()

        timestamp_str, _ = payload.split(':', 1)
        timestamp = int(timestamp_str)

        return time.time() - timestamp > CAPTCHA_TTL
    except Exception:
        return True


def render_captcha_png(answer: str) -> bytes:
    """Render CAPTCHA text as PNG image."""
    # Create simple image
    img = Image.new('RGB', (200, 60), color='white')
    draw = ImageDraw.Draw(img)

    # Draw text (using default font)
    draw.text((20, 15), answer, fill='black')

    # Convert to bytes
    buf = BytesIO()
    img.save(buf, format='PNG')
    return buf.getvalue()