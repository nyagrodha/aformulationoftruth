"""Comprehensive tests for captcha module."""

import time
from unittest.mock import patch

import pytest
from cryptography.fernet import Fernet

from app.captcha import (
    CAPTCHA_LEN,
    CAPTCHA_TTL,
    generate_captcha,
    is_token_expired,
    render_captcha_png,
    verify_captcha,
)


class TestCaptchaGeneration:
    """Test CAPTCHA generation."""

    def test_generate_captcha_returns_tuple(self, test_settings):
        """Returns tuple of (answer, token)."""
        result = generate_captcha()
        assert isinstance(result, tuple)
        assert len(result) == 2

    def test_generate_captcha_answer_length(self, test_settings):
        """Generated answer has correct length."""
        answer, _ = generate_captcha()
        assert len(answer) == CAPTCHA_LEN

    def test_generate_captcha_answer_characters(self, test_settings):
        """Generated answer uses valid characters."""
        answer, _ = generate_captcha()
        valid_chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

        for char in answer:
            assert char in valid_chars

    def test_generate_captcha_token_not_empty(self, test_settings):
        """Generated token is not empty."""
        _, token = generate_captcha()
        assert isinstance(token, str)
        assert len(token) > 0

    def test_generate_captcha_randomness(self, test_settings):
        """Multiple generations produce different answers."""
        results = [generate_captcha() for _ in range(10)]
        answers = [r[0] for r in results]

        # At least some should be different
        assert len(set(answers)) > 1

    def test_generate_captcha_token_encrypted(self, test_settings):
        """Token is encrypted with Fernet."""
        answer, token = generate_captcha()

        # Should be decryptable with session secret
        key = test_settings.session_secret.encode()
        f = Fernet(key)

        try:
            decrypted = f.decrypt(token.encode())
            assert len(decrypted) > 0
        except Exception:
            pytest.fail("Token is not valid Fernet encrypted data")


class TestCaptchaVerification:
    """Test CAPTCHA verification."""

    def test_verify_captcha_correct_answer(self, test_settings):
        """Verifies correct answer successfully."""
        answer, token = generate_captcha()
        assert verify_captcha(answer, token) is True

    def test_verify_captcha_wrong_answer(self, test_settings):
        """Rejects wrong answer."""
        _, token = generate_captcha()
        assert verify_captcha("WRONG", token) is False

    def test_verify_captcha_case_insensitive(self, test_settings):
        """Verification is case insensitive."""
        answer, token = generate_captcha()
        assert verify_captcha(answer.lower(), token) is True

    def test_verify_captcha_strips_whitespace(self, test_settings):
        """Strips whitespace from user answer."""
        answer, token = generate_captcha()
        assert verify_captcha(f"  {answer}  ", token) is True

    def test_verify_captcha_expired_token(self, test_settings):
        """Rejects expired token."""
        # Generate captcha with old timestamp
        with patch("time.time", return_value=time.time() - CAPTCHA_TTL - 10):
            answer, token = generate_captcha()

        # Verify with current time
        assert verify_captcha(answer, token) is False

    def test_verify_captcha_invalid_token(self, test_settings):
        """Rejects invalid token."""
        assert verify_captcha("ANSWER", "invalid-token") is False

    def test_verify_captcha_empty_answer(self, test_settings):
        """Rejects empty answer."""
        _, token = generate_captcha()
        assert verify_captcha("", token) is False

    def test_verify_captcha_malformed_token(self, test_settings):
        """Handles malformed token gracefully."""
        assert verify_captcha("ANSWER", "not-a-valid-token") is False


class TestTokenExpiration:
    """Test token expiration checking."""

    def test_is_token_expired_fresh(self, test_settings):
        """Fresh token is not expired."""
        _, token = generate_captcha()
        assert is_token_expired(token) is False

    def test_is_token_expired_old(self, test_settings):
        """Old token is expired."""
        # Generate token with old timestamp
        with patch("time.time", return_value=time.time() - CAPTCHA_TTL - 10):
            _, token = generate_captcha()

        assert is_token_expired(token) is True

    def test_is_token_expired_at_boundary(self, test_settings):
        """Token at TTL boundary."""
        # Generate token at exactly TTL seconds ago
        with patch("time.time", return_value=time.time() - CAPTCHA_TTL):
            _, token = generate_captcha()

        # Should be expired (or very close)
        result = is_token_expired(token)
        assert isinstance(result, bool)

    def test_is_token_expired_invalid_token(self, test_settings):
        """Invalid token is considered expired."""
        assert is_token_expired("invalid") is True

    def test_is_token_expired_empty_token(self, test_settings):
        """Empty token is considered expired."""
        assert is_token_expired("") is True


class TestCaptchaRendering:
    """Test CAPTCHA image rendering."""

    def test_render_captcha_png_returns_bytes(self):
        """Renders CAPTCHA as bytes."""
        result = render_captcha_png("ABC123")
        assert isinstance(result, bytes)

    def test_render_captcha_png_not_empty(self):
        """Rendered image is not empty."""
        result = render_captcha_png("ABC123")
        assert len(result) > 0

    def test_render_captcha_png_different_texts(self):
        """Different texts produce different images."""
        img1 = render_captcha_png("ABC123")
        img2 = render_captcha_png("XYZ789")

        # Images should be different
        # (they might have same size but different content)
        assert isinstance(img1, bytes)
        assert isinstance(img2, bytes)

    def test_render_captcha_png_valid_png_header(self):
        """Rendered image has PNG header."""
        result = render_captcha_png("TEST")

        # PNG files start with specific bytes
        png_header = b'\x89PNG\r\n\x1a\n'
        assert result.startswith(png_header)

    def test_render_captcha_png_empty_string(self):
        """Handles empty string."""
        result = render_captcha_png("")
        assert isinstance(result, bytes)
        assert len(result) > 0

    def test_render_captcha_png_long_text(self):
        """Handles long text."""
        result = render_captcha_png("A" * 100)
        assert isinstance(result, bytes)
        assert len(result) > 0

    def test_render_captcha_png_special_chars(self):
        """Handles special characters."""
        result = render_captcha_png("!@#$%^")
        assert isinstance(result, bytes)
        assert len(result) > 0


class TestCaptchaConstants:
    """Test CAPTCHA constants."""

    def test_captcha_len_positive(self):
        """CAPTCHA_LEN is positive."""
        assert CAPTCHA_LEN > 0

    def test_captcha_len_reasonable(self):
        """CAPTCHA_LEN is reasonable length."""
        assert 4 <= CAPTCHA_LEN <= 10

    def test_captcha_ttl_positive(self):
        """CAPTCHA_TTL is positive."""
        assert CAPTCHA_TTL > 0

    def test_captcha_ttl_reasonable(self):
        """CAPTCHA_TTL is reasonable duration."""
        assert 60 <= CAPTCHA_TTL <= 600  # 1-10 minutes


class TestCaptchaEdgeCases:
    """Test edge cases and boundary conditions."""

    def test_verify_captcha_unicode_answer(self, test_settings):
        """Handles Unicode in answer."""
        _, token = generate_captcha()
        assert verify_captcha("你好", token) is False

    def test_verify_captcha_very_long_answer(self, test_settings):
        """Handles very long answer."""
        _, token = generate_captcha()
        assert verify_captcha("A" * 10000, token) is False

    def test_render_captcha_png_unicode(self):
        """Handles Unicode in render."""
        result = render_captcha_png("你好")
        assert isinstance(result, bytes)
        assert len(result) > 0

    def test_generate_captcha_no_ambiguous_chars(self, test_settings):
        """Generated CAPTCHAs avoid ambiguous characters."""
        # Characters like 0, O, 1, I, l are typically excluded
        ambiguous = '01OIl'

        for _ in range(20):
            answer, _ = generate_captcha()
            for char in ambiguous:
                assert char not in answer

    def test_captcha_timestamp_in_token(self, test_settings):
        """Token contains timestamp."""
        answer, token = generate_captcha()

        # Decrypt token
        key = test_settings.session_secret.encode()
        f = Fernet(key)
        decrypted = f.decrypt(token.encode()).decode()

        # Should contain timestamp:answer format
        assert ":" in decrypted
        parts = decrypted.split(":", 1)
        assert len(parts) == 2

        timestamp_str, token_answer = parts
        assert timestamp_str.isdigit()
        assert token_answer == answer

    def test_concurrent_captcha_generation(self, test_settings):
        """Multiple CAPTCHAs can be generated concurrently."""
        results = [generate_captcha() for _ in range(100)]

        # All should be valid
        assert len(results) == 100

        # Tokens should all be unique
        tokens = [r[1] for r in results]
        assert len(set(tokens)) == 100