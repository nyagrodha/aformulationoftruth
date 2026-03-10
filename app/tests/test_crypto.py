"""Comprehensive tests for crypto module."""

import base64
import json

import pytest

from app.crypto import (
    encrypt_answers,
    generate_csrf_token,
    generate_token,
    shuffle_questions,
)


class TestTokenGeneration:
    """Test token generation functions."""

    def test_generate_token_default_length(self):
        """Generates token with default length."""
        token = generate_token()
        assert isinstance(token, str)
        assert len(token) > 20  # URL-safe base64 of 32 bytes

    def test_generate_token_custom_length(self):
        """Generates token with custom length."""
        token = generate_token(nbytes=16)
        assert isinstance(token, str)
        # Shorter than default
        assert len(token) < len(generate_token(nbytes=32))

    def test_generate_token_randomness(self):
        """Multiple calls produce different tokens."""
        tokens = [generate_token() for _ in range(10)]
        assert len(set(tokens)) == 10  # All unique

    def test_generate_csrf_token_format(self):
        """CSRF token has correct format."""
        token = generate_csrf_token()
        assert isinstance(token, str)
        assert len(token) > 20

    def test_generate_csrf_token_randomness(self):
        """CSRF tokens are unique."""
        tokens = [generate_csrf_token() for _ in range(10)]
        assert len(set(tokens)) == 10


class TestQuestionShuffling:
    """Test question shuffling logic."""

    def test_shuffle_questions_deterministic(self):
        """Same seed produces same order."""
        seed = "test-seed"
        order1 = shuffle_questions(seed)
        order2 = shuffle_questions(seed)
        assert order1 == order2

    def test_shuffle_questions_different_seeds(self):
        """Different seeds produce different orders."""
        order1 = shuffle_questions("seed1")
        order2 = shuffle_questions("seed2")

        # Very high probability they're different
        # (unless we're extremely unlucky)
        assert order1 != order2 or len(order1) == 0

    def test_shuffle_questions_returns_list(self):
        """Returns list of question IDs."""
        result = shuffle_questions("test")
        assert isinstance(result, list)

    def test_shuffle_questions_all_questions_present(self):
        """All question IDs are present after shuffle."""
        from app.questions import MAIN_QUESTIONS

        expected_ids = {q.id for q in MAIN_QUESTIONS}
        shuffled = shuffle_questions("test")

        assert set(shuffled) == expected_ids

    def test_shuffle_questions_no_duplicates(self):
        """Shuffled list has no duplicates."""
        shuffled = shuffle_questions("test")
        assert len(shuffled) == len(set(shuffled))

    def test_shuffle_questions_empty_seed(self):
        """Handles empty seed string."""
        result = shuffle_questions("")
        assert isinstance(result, list)
        assert len(result) > 0

    def test_shuffle_questions_special_chars_seed(self):
        """Handles seeds with special characters."""
        result = shuffle_questions("test!@#$%^&*()")
        assert isinstance(result, list)
        assert len(result) > 0

    def test_shuffle_questions_unicode_seed(self):
        """Handles Unicode characters in seed."""
        result = shuffle_questions("test-🔒-seed")
        assert isinstance(result, list)
        assert len(result) > 0


class TestAnswerEncryption:
    """Test answer encryption."""

    def test_encrypt_answers_with_valid_recipient(self, test_settings):
        """Encrypts answers with valid recipient."""
        test_settings.age_recipient = "age1test..."
        payload = {
            "answers": {"1": "answer1"},
            "question_order_seed": "seed",
            "question_count": 1
        }

        result = encrypt_answers(payload)
        assert isinstance(result, str)
        assert len(result) > 0

    def test_encrypt_answers_without_recipient(self):
        """Raises error without age recipient."""
        with pytest.fixture as mock_settings:
            mock_settings.age_recipient = ""

            payload = {"answers": {}}
            with pytest.raises(RuntimeError, match="AGE_RECIPIENT"):
                encrypt_answers(payload)

    def test_encrypt_answers_base64_output(self, test_settings):
        """Encrypted output is valid base64."""
        test_settings.age_recipient = "age1test..."
        payload = {"answers": {"1": "test"}}

        encrypted = encrypt_answers(payload)

        # Should be valid base64
        try:
            decoded = base64.b64decode(encrypted)
            assert len(decoded) > 0
        except Exception:
            pytest.fail("Encrypted output is not valid base64")

    def test_encrypt_answers_with_empty_answers(self, test_settings):
        """Handles empty answers dict."""
        test_settings.age_recipient = "age1test..."
        payload = {
            "answers": {},
            "question_order_seed": "seed",
            "question_count": 0
        }

        result = encrypt_answers(payload)
        assert isinstance(result, str)

    def test_encrypt_answers_with_complex_data(self, test_settings):
        """Handles complex answer data."""
        test_settings.age_recipient = "age1test..."
        payload = {
            "answers": {
                "1": "Short answer",
                "2": "A" * 1000,  # Long answer
                "3": "Unicode: 你好世界 🌍",
                "4": "Special: <>&\"'",
            },
            "question_order_seed": "complex-seed-123",
            "question_count": 4
        }

        result = encrypt_answers(payload)
        assert isinstance(result, str)
        assert len(result) > 0

    def test_encrypt_answers_preserves_structure(self, test_settings):
        """Encrypted data preserves original structure."""
        test_settings.age_recipient = "age1test..."
        payload = {
            "answers": {"1": "test", "2": "data"},
            "question_order_seed": "seed123",
            "question_count": 2
        }

        encrypted = encrypt_answers(payload)
        # Decode the base64
        decoded = base64.b64decode(encrypted)
        # Should be valid JSON
        original = json.loads(decoded.decode())

        assert original == payload


class TestCryptoEdgeCases:
    """Test edge cases and boundary conditions."""

    def test_token_generation_zero_bytes(self):
        """Handles zero-byte token generation."""
        token = generate_token(nbytes=0)
        # Should still generate a valid (short) token
        assert isinstance(token, str)

    def test_token_generation_large_bytes(self):
        """Handles large byte count."""
        token = generate_token(nbytes=1024)
        assert isinstance(token, str)
        assert len(token) > 100

    def test_shuffle_very_long_seed(self):
        """Handles very long seed strings."""
        long_seed = "a" * 10000
        result = shuffle_questions(long_seed)
        assert isinstance(result, list)
        assert len(result) > 0

    def test_encrypt_answers_unicode_seed(self, test_settings):
        """Handles Unicode in seed during encryption."""
        test_settings.age_recipient = "age1test..."
        payload = {
            "answers": {"1": "answer"},
            "question_order_seed": "unicode-seed-🔐",
            "question_count": 1
        }

        result = encrypt_answers(payload)
        assert isinstance(result, str)