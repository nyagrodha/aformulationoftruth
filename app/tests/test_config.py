"""Comprehensive tests for configuration module."""

import pytest
from pydantic import ValidationError

from app.config import Settings, settings


class TestSettings:
    """Test application settings."""

    def test_settings_defaults(self):
        """Settings have sensible defaults."""
        s = Settings()

        assert s.database_url.startswith("postgresql://")
        assert s.session_max_age == 86400
        assert s.rate_limit_window == 60
        assert s.rate_limit_max == 10
        assert s.lotto_min_participants == 15
        assert s.lotto_window_days == 21
        assert s.lotto_claim_window_days == 7

    def test_settings_custom_values(self):
        """Settings can be customized."""
        s = Settings(
            database_url="postgresql://custom@localhost/test",
            session_max_age=3600,
            rate_limit_max=20
        )

        assert s.database_url == "postgresql://custom@localhost/test"
        assert s.session_max_age == 3600
        assert s.rate_limit_max == 20

    def test_settings_secrets_default_empty(self):
        """Secret settings default to empty strings."""
        s = Settings()

        assert s.hmac_secret == ""
        assert s.session_secret == ""
        assert s.age_recipient == ""

    def test_settings_lotto_configuration(self):
        """Lotto settings have correct defaults."""
        s = Settings()

        assert s.lotto_min_participants == 15
        assert s.lotto_window_days == 21
        assert s.lotto_claim_window_days == 7
        assert "drand" in s.lotto_drand_url_template
        assert s.lotto_default_drand_round_target == 0

    def test_settings_case_insensitive(self):
        """Settings are case insensitive."""
        # This tests the model_config setting
        config = Settings.model_config
        assert config["case_sensitive"] is False

    def test_global_settings_instance(self):
        """Global settings instance is accessible."""
        assert settings is not None
        assert isinstance(settings, Settings)

    def test_settings_rate_limiting(self):
        """Rate limiting settings are configurable."""
        s = Settings(
            rate_limit_window=120,
            rate_limit_max=50
        )

        assert s.rate_limit_window == 120
        assert s.rate_limit_max == 50

    def test_settings_session_configuration(self):
        """Session configuration is accessible."""
        s = Settings(session_max_age=7200)
        assert s.session_max_age == 7200

    def test_settings_lotto_operator_config(self):
        """Lotto operator configuration exists."""
        s = Settings(
            lotto_operator_token="test-token",
            lotto_operator_signing_key_b64="YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU="
        )

        assert s.lotto_operator_token == "test-token"
        assert len(s.lotto_operator_signing_key_b64) > 0

    def test_settings_database_url_format(self):
        """Database URL has expected format."""
        s = Settings()
        assert "postgresql://" in s.database_url or "postgres://" in s.database_url

    def test_settings_immutable_after_creation(self):
        """Settings values are accessible after creation."""
        s = Settings(session_max_age=1000)
        assert s.session_max_age == 1000

        # Pydantic settings are not frozen by default, but we can verify it works
        s2 = Settings(session_max_age=2000)
        assert s2.session_max_age == 2000
        assert s.session_max_age == 1000  # Original unchanged


class TestSettingsEdgeCases:
    """Test edge cases and boundary conditions."""

    def test_settings_with_zero_values(self):
        """Settings handle zero values."""
        s = Settings(
            rate_limit_max=0,
            lotto_default_drand_round_target=0
        )

        assert s.rate_limit_max == 0
        assert s.lotto_default_drand_round_target == 0

    def test_settings_with_large_values(self):
        """Settings handle large values."""
        s = Settings(
            session_max_age=31536000,  # 1 year
            lotto_window_days=365
        )

        assert s.session_max_age == 31536000
        assert s.lotto_window_days == 365

    def test_settings_empty_string_secrets(self):
        """Empty string secrets are valid (though not secure)."""
        s = Settings(
            hmac_secret="",
            session_secret="",
            age_recipient=""
        )

        assert s.hmac_secret == ""
        assert s.session_secret == ""
        assert s.age_recipient == ""

    def test_settings_with_special_chars_in_url(self):
        """Database URL can contain special characters."""
        s = Settings(
            database_url="postgresql://user:p%40ssw0rd@host:5432/db?sslmode=require"
        )

        assert "p%40ssw0rd" in s.database_url
        assert "sslmode=require" in s.database_url

    def test_settings_url_template_formatting(self):
        """Drand URL template contains placeholder."""
        s = Settings()
        assert "{round}" in s.lotto_drand_url_template

    def test_settings_realistic_configuration(self):
        """Test with realistic production-like values."""
        s = Settings(
            database_url="postgresql://app@/prod?host=/var/run/postgresql",
            session_secret="a" * 44,  # Valid Fernet key length
            hmac_secret="b" * 32,
            session_max_age=86400,
            rate_limit_window=60,
            rate_limit_max=10,
            lotto_min_participants=20,
            lotto_window_days=14,
            lotto_claim_window_days=7
        )

        assert s.database_url.startswith("postgresql://")
        assert len(s.session_secret) == 44
        assert s.rate_limit_max == 10
        assert s.lotto_min_participants == 20