"""Stateless image CAPTCHA — no JS, no server state, Tor-safe.

Token = HMAC(uppercase(answer) + ":" + timestamp) + ":" + timestamp
Verification recomputes the HMAC and checks the embedded TTL.
"""

import base64
import hashlib
import hmac
import io
import random
import secrets
import string
import time

from PIL import Image, ImageDraw, ImageFont

from app.config import settings

CAPTCHA_LEN = 6
_TTL_SECONDS = 300  # 5 minutes
_CHARSET = string.ascii_uppercase + string.digits
# Remove ambiguous characters
_CHARSET = _CHARSET.replace("O", "").replace("0", "").replace("I", "").replace("1", "").replace("L", "")

_WIDTH = 560
_HEIGHT = 120
_BG = (10, 10, 10)        # #0a0a0a
_FG = (224, 224, 224)      # #e0e0e0
_NOISE = (51, 51, 51)      # #333


def _hmac_key() -> bytes:
    return (settings.hmac_secret or "captcha-dev-key").encode()


def _sign(answer_upper: str, ts: str) -> str:
    payload = f"{answer_upper}:{ts}".encode()
    return hmac.new(_hmac_key(), payload, hashlib.sha256).hexdigest()


def generate_captcha() -> tuple[str, str]:
    """Return (answer, token) where token is a self-contained HMAC blob."""
    answer = "".join(secrets.choice(_CHARSET) for _ in range(CAPTCHA_LEN))
    ts = str(int(time.time()))
    sig = _sign(answer, ts)
    token = f"{sig}:{ts}"
    return answer, token


def is_token_expired(token: str) -> bool:
    """Check whether the embedded timestamp exceeds TTL."""
    try:
        _, ts_str = token.rsplit(":", 1)
        ts = int(ts_str)
    except (ValueError, AttributeError):
        return True
    return (int(time.time()) - ts) > _TTL_SECONDS


def verify_captcha(answer: str, token: str) -> bool:
    """Verify the answer against the HMAC token (case-insensitive)."""
    if not answer or not token:
        return False
    if is_token_expired(token):
        return False
    try:
        sig, ts_str = token.rsplit(":", 1)
    except (ValueError, AttributeError):
        return False
    expected = _sign(answer.strip().upper(), ts_str)
    return hmac.compare_digest(sig, expected)


def render_captcha_png(answer: str) -> bytes:
    """Render distorted monospace text as a PNG image."""
    img = Image.new("RGB", (_WIDTH, _HEIGHT), _BG)
    draw = ImageDraw.Draw(img)

    # Try to use a monospace font, fall back to default
    font = None
    font_size = 48
    for font_path in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf",
        "/usr/share/fonts/TTF/DejaVuSansMono-Bold.ttf",
    ):
        try:
            font = ImageFont.truetype(font_path, font_size)
            break
        except (OSError, IOError):
            continue
    if font is None:
        font = ImageFont.load_default()

    # Draw noise lines
    rng = random.Random()
    for _ in range(8):
        x1, y1 = rng.randint(0, _WIDTH), rng.randint(0, _HEIGHT)
        x2, y2 = rng.randint(0, _WIDTH), rng.randint(0, _HEIGHT)
        draw.line([(x1, y1), (x2, y2)], fill=_NOISE, width=1)

    # Draw each character with slight random offset and rotation
    char_width = _WIDTH // (CAPTCHA_LEN + 2)
    x_start = char_width
    for i, ch in enumerate(answer):
        x = x_start + i * char_width + rng.randint(-5, 5)
        y = (_HEIGHT - font_size) // 2 + rng.randint(-10, 10)

        # Create a small image for each char so we can rotate it
        char_img = Image.new("RGBA", (font_size + 20, font_size + 20), (0, 0, 0, 0))
        char_draw = ImageDraw.Draw(char_img)
        char_draw.text((10, 5), ch, fill=_FG, font=font)

        rotation = rng.randint(-15, 15)
        char_img = char_img.rotate(rotation, expand=False, fillcolor=(0, 0, 0, 0))

        img.paste(char_img, (x, y), char_img)

    # Draw more noise dots
    for _ in range(200):
        x, y = rng.randint(0, _WIDTH - 1), rng.randint(0, _HEIGHT - 1)
        draw.point((x, y), fill=_NOISE)

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()
