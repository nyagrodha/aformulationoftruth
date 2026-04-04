"""Server-side optometrist-lens CAPTCHA.

Seven characters are rendered inside rotating lens rings at varying angles,
scales, and depths — evoking the look of an optometrist's phoropter clicking
through lens settings. Users type all 7 characters to prove humanity.

Token format:
    nonce : timestamp : HMAC-SHA256(nonce | answer | timestamp)
"""

import hashlib
import hmac
import math
import os
import random
import time
from io import BytesIO

from PIL import Image, ImageDraw, ImageFont

from app.config import settings

CAPTCHA_TTL = 300  # seconds
CAPTCHA_LEN = 7

# Pool includes visually ambiguous characters — hard for OCR, readable by humans
# with focus. Mix of letters, digits, and symbols.
CHAR_POOL = "B8D04ACGS5Z2#7HKMNRXWFJ6"


def _hmac_hex(msg: bytes) -> str:
    return hmac.new(
        settings.hmac_secret.encode(), msg, hashlib.sha256
    ).hexdigest()


# ── Font loading ──────────────────────────────────────────────

_FONT_PATHS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
]


def _load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in _FONT_PATHS:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


# ── Challenge generation ──────────────────────────────────────


def generate_captcha() -> tuple[str, str]:
    """Create a lens-style CAPTCHA challenge.

    Returns (answer, token).
      - answer: 7-char string (for rendering the image)
      - token:  HMAC commitment to the correct answer
    """
    answer = "".join(random.choices(CHAR_POOL, k=CAPTCHA_LEN))

    nonce = os.urandom(16).hex()
    ts = str(int(time.time()))
    sig = _hmac_hex(f"{nonce}|{answer}|{ts}".encode())
    token = f"{nonce}:{ts}:{sig}"

    return answer, token


# ── Token verification ────────────────────────────────────────


def verify_captcha(user_answer: str, token: str) -> bool:
    """Verify the user's answer against the HMAC token."""
    try:
        parts = token.split(":")
        if len(parts) != 3:
            return False
        nonce, ts_str, sig = parts
        int(ts_str)
    except (ValueError, AttributeError):
        return False

    if time.time() - int(ts_str) > CAPTCHA_TTL:
        return False

    cleaned = user_answer.upper().strip().replace(" ", "")
    expected = _hmac_hex(f"{nonce}|{cleaned}|{ts_str}".encode())
    return hmac.compare_digest(sig, expected)


def is_token_expired(token: str) -> bool:
    """Check if a token's timestamp has exceeded the TTL."""
    try:
        parts = token.split(":")
        if len(parts) != 3:
            return True
        ts_str = parts[1]
        return time.time() - int(ts_str) > CAPTCHA_TTL
    except (ValueError, AttributeError):
        return True


# ── Lens-style PNG rendering ─────────────────────────────────


def _draw_lens_ring(draw: ImageDraw.Draw, cx: int, cy: int, r: int,
                    rng: random.Random) -> None:
    """Draw concentric rings simulating an optometrist lens element."""
    # Outer ring
    draw.ellipse(
        [cx - r, cy - r, cx + r, cy + r],
        outline=(60, 60, 60), width=2,
    )
    # Inner concentric rings (like lens coatings)
    for i in range(1, rng.randint(2, 4)):
        ir = r - i * rng.randint(3, 6)
        if ir < r // 3:
            break
        shade = 35 + i * 8
        draw.ellipse(
            [cx - ir, cy - ir, cx + ir, cy + ir],
            outline=(shade, shade, shade), width=1,
        )
    # Crosshair ticks (reticle marks)
    tick = rng.randint(4, 8)
    shade = rng.randint(40, 60)
    col = (shade, shade, shade)
    draw.line([(cx - r, cy), (cx - r + tick, cy)], fill=col, width=1)
    draw.line([(cx + r - tick, cy), (cx + r, cy)], fill=col, width=1)
    draw.line([(cx, cy - r), (cx, cy - r + tick)], fill=col, width=1)
    draw.line([(cx, cy + r - tick), (cx, cy + r)], fill=col, width=1)


def render_captcha_png(answer: str) -> bytes:
    """Render 7 characters inside rotating lens rings.

    Each character sits in its own circular lens at a random rotation,
    with concentric rings and reticle marks. Noise layers prevent
    simple image-diffing and OCR.
    """
    W, H = 560, 120
    img = Image.new("RGB", (W, H), (12, 12, 12))
    draw = ImageDraw.Draw(img)

    rng = random.Random()  # unseeded — varies per call

    font_large = _load_font(30)
    font_small = _load_font(24)

    # Layout: 7 lens slots evenly spaced
    slot_w = W // CAPTCHA_LEN
    lens_r = 28  # lens ring radius

    for idx, ch in enumerate(answer):
        # Center of this lens slot with jitter
        cx = slot_w * idx + slot_w // 2 + rng.randint(-6, 6)
        cy = H // 2 + rng.randint(-10, 10)

        # Draw the lens ring structure
        _draw_lens_ring(draw, cx, cy, lens_r, rng)

        # Render character on a rotatable tile
        angle = rng.uniform(-35, 35)
        font = rng.choice([font_large, font_small])
        tile_size = 56
        tile = Image.new("RGBA", (tile_size, tile_size), (0, 0, 0, 0))
        tile_draw = ImageDraw.Draw(tile)

        # Character color varies slightly
        brightness = rng.randint(180, 230)
        tile_draw.text(
            (tile_size // 2, tile_size // 2), ch,
            fill=(brightness, brightness, brightness, 255),
            font=font, anchor="mm",
        )

        # Rotate the tile
        tile = tile.rotate(angle, expand=False, resample=Image.BICUBIC)

        # Clip to circular lens boundary using a mask
        mask = Image.new("L", (tile_size, tile_size), 0)
        mask_draw = ImageDraw.Draw(mask)
        clip_r = lens_r - 3
        mask_draw.ellipse(
            [tile_size // 2 - clip_r, tile_size // 2 - clip_r,
             tile_size // 2 + clip_r, tile_size // 2 + clip_r],
            fill=255,
        )

        # Paste clipped character into image
        paste_x = cx - tile_size // 2
        paste_y = cy - tile_size // 2
        img.paste(tile, (paste_x, paste_y), mask)

    # ── Noise layers ──

    # Radial scratch lines (like lens surface scratches)
    for _ in range(6):
        sx = rng.randint(0, W)
        sy = rng.randint(0, H)
        angle = rng.uniform(0, math.pi * 2)
        length = rng.randint(30, 80)
        ex = int(sx + length * math.cos(angle))
        ey = int(sy + length * math.sin(angle))
        shade = rng.randint(25, 50)
        draw.line([(sx, sy), (ex, ey)], fill=(shade, shade, shade), width=1)

    # Tiny scattered dots (dust on lens)
    for _ in range(80):
        dx, dy = rng.randint(0, W), rng.randint(0, H)
        r = rng.choice([1, 1, 1, 2])
        shade = rng.randint(30, 65)
        draw.ellipse([dx - r, dy - r, dx + r, dy + r],
                     fill=(shade, shade, shade))

    # Faint arcs crossing the image (lens flare)
    for _ in range(3):
        x0 = rng.randint(-20, W // 2)
        x1 = rng.randint(W // 2, W + 20)
        y0 = rng.randint(-10, H)
        y1 = rng.randint(-10, H)
        if y0 > y1:
            y0, y1 = y1, y0
        if y0 == y1:
            y1 += 1
        draw.arc(
            [x0, y0, x1, y1], 0, rng.randint(120, 300),
            fill=(40, 40, 40), width=1,
        )

    # Thin border
    draw.rectangle([0, 0, W - 1, H - 1], outline=(40, 40, 40))

    buf = BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()
