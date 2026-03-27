"""Token generation, age encryption, and Feynman shuffle for questionnaire ordering."""

import base64
import hashlib
import hmac
import json
import random
import secrets

import pyrage
import pyrage.x25519

from app.config import settings


def generate_csrf_token() -> str:
    """Return a random URL-safe token for CSRF protection."""
    return secrets.token_urlsafe(32)


def generate_token() -> str:
    """Return a random hex token for gate submission."""
    return secrets.token_hex(32)


def encrypt_answers(payload: dict) -> str:
    """Age-encrypt a JSON-serialisable dict, returning base64-encoded ciphertext.

    Uses the ``age_recipient`` X25519 public key from application settings.
    """
    if not settings.age_recipient:
        raise ValueError("AGE_RECIPIENT is not configured")

    plaintext = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    recipient = pyrage.x25519.Recipient(settings.age_recipient)
    ciphertext = pyrage.encrypt(plaintext, [recipient])
    return base64.b64encode(ciphertext).decode("ascii")


def shuffle_questions(seed: str) -> list[int]:
    """Feynman shuffle: seeded Fisher-Yates on question IDs [2..34].

    Derives a deterministic PRNG seed from *seed* via HMAC-SHA256 so that the
    same seed always produces the same shuffled order.  The result is persisted
    per-user in the DB as ``question_order_seed``.
    """
    key = (settings.hmac_secret or "default-dev-key").encode()
    derived = hmac.new(key, seed.encode(), hashlib.sha256).digest()

    int_seed = int.from_bytes(derived[:8], "big")
    rng = random.Random(int_seed)

    ids = list(range(2, 35))  # [2, 3, ..., 34]

    # Fisher-Yates shuffle
    for i in range(len(ids) - 1, 0, -1):
        j = rng.randint(0, i)
        ids[i], ids[j] = ids[j], ids[i]

    return ids
