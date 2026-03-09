"""Comprehensive tests for app/config.py configuration management."""

import os
from unittest.mock import patch
import pytest
from pydantic import ValidationError

from app.config import Settings, settings


class TestSettings:
    """Test Settings configuration class."""

    def test_default_values(self):
        """Test that Settings has correct default values."""
        s = Settings()
        assert s.database_url == "postgresql://a4m_gate_app@/a4m_gate?host=/var/run/postgresql-gate&port=5433"
        assert s.age_recipient == ""
        assert s.hmac_secret == ""
        assert s.session_secret == ""
        assert s.rate_limit_window == 60
        assert s.rate_limit_max == 10
        assert s.session_max_age == 86400
        assert s.lotto_min_participants == 15
        assert s.lotto_window_days == 21
        assert s.lotto_claim_window_days == 7
        assert s.lotto_drand_url_template == "https://api.drand.sh/public/{round}"
        assert s.lotto_default_drand_round_target == 0
        assert s.lotto_operator_token == ""
        assert s.lotto_operator_signing_key_b64 == ""

    def test_env_override(self):
        """Test that environment variables override defaults."""
        with patch.dict(os.environ, {
            "DATABASE_URL": "postgresql://test@localhost/testdb",
            "AGE_RECIPIENT": "test_recipient",
            "HMAC_SECRET": "test_hmac_secret",
            "SESSION_SECRET": "test_session_secret",
            "RATE_LIMIT_WINDOW": "120",
            "RATE_LIMIT_MAX": "20",
            "SESSION_MAX_AGE": "3600",
            "LOTTO_MIN_PARTICIPANTS": "10",
            "LOTTO_WINDOW_DAYS": "14",
            "LOTTO_CLAIM_WINDOW_DAYS": "3",
            "LOTTO_OPERATOR_TOKEN": "test_token",
            "LOTTO_OPERATOR_SIGNING_KEY_B64": "test_key",
        }):
            s = Settings()
            assert s.database_url == "postgresql://test@localhost/testdb"
            assert s.age_recipient == "test_recipient"
            assert s.hmac_secret == "test_hmac_secret"
            assert s.session_secret == "test_session_secret"
            assert s.rate_limit_window == 120
            assert s.rate_limit_max == 20
            assert s.session_max_age == 3600
            assert s.lotto_min_participants == 10
            assert s.lotto_window_days == 14
            assert s.lotto_claim_window_days == 3
            assert s.lotto_operator_token == "test_token"
            assert s.lotto_operator_signing_key_b64 == "test_key"

    def test_case_insensitive_env_vars(self):
        """Test that environment variables are case insensitive."""
        with patch.dict(os.environ, {"database_url": "postgresql://test@localhost/testdb"}):
            s = Settings()
            assert s.database_url == "postgresql://test@localhost/testdb"

    def test_integer_validation(self):
        """Test that integer fields validate correctly."""
        with patch.dict(os.environ, {"RATE_LIMIT_WINDOW": "not_an_int"}):
            with pytest.raises(ValidationError):
                Settings()

    def test_rate_limit_window_positive(self):
        """Test that rate limit window accepts positive values."""
        with patch.dict(os.environ, {"RATE_LIMIT_WINDOW": "1"}):
            s = Settings()
            assert s.rate_limit_window == 1

    def test_lotto_min_participants_boundary(self):
        """Test lotto minimum participants boundary values."""
        with patch.dict(os.environ, {"LOTTO_MIN_PARTICIPANTS": "1"}):
            s = Settings()
            assert s.lotto_min_participants == 1

        with patch.dict(os.environ, {"LOTTO_MIN_PARTICIPANTS": "1000"}):
            s = Settings()
            assert s.lotto_min_participants == 1000

    def test_session_max_age_boundary(self):
        """Test session max age boundary values."""
        # Test minimum (1 second)
        with patch.dict(os.environ, {"SESSION_MAX_AGE": "1"}):
            s = Settings()
            assert s.session_max_age == 1

        # Test large value (1 year)
        with patch.dict(os.environ, {"SESSION_MAX_AGE": "31536000"}):
            s = Settings()
            assert s.session_max_age == 31536000

    def test_drand_url_template_format(self):
        """Test that drand URL template contains placeholder."""
        s = Settings()
        assert "{round}" in s.lotto_drand_url_template

    def test_empty_string_secrets(self):
        """Test that secret fields can be empty strings (for development)."""
        s = Settings()
        assert isinstance(s.hmac_secret, str)
        assert isinstance(s.session_secret, str)
        assert isinstance(s.lotto_operator_token, str)

    def test_settings_singleton_instance(self):
        """Test that settings module exports a singleton instance."""
        assert isinstance(settings, Settings)

    def test_model_config_case_sensitivity(self):
        """Test that model config is case insensitive."""
        s = Settings()
        assert s.model_config["case_sensitive"] is False

    def test_lotto_default_drand_round_target_zero(self):
        """Test that default drand round target is zero."""
        s = Settings()
        assert s.lotto_default_drand_round_target == 0

    def test_multiple_settings_instances_independent(self):
        """Test that multiple Settings instances can have different values."""
        with patch.dict(os.environ, {"RATE_LIMIT_MAX": "5"}):
            s1 = Settings()

        with patch.dict(os.environ, {"RATE_LIMIT_MAX": "10"}):
            s2 = Settings()

        assert s1.rate_limit_max == 5
        assert s2.rate_limit_max == 10

    def test_database_url_format_validation(self):
        """Test that database URL accepts valid PostgreSQL connection strings."""
        valid_urls = [
            "postgresql://user@host/db",
            "postgresql://user:pass@host:5432/db",
            "postgresql://user@/db?host=/var/run/postgresql&port=5433",
        ]
        for url in valid_urls:
            with patch.dict(os.environ, {"DATABASE_URL": url}):
                s = Settings()
                assert s.database_url == url

    def test_lotto_window_days_configuration(self):
        """Test lotto window days accepts various durations."""
        test_values = [1, 7, 14, 21, 30, 90]
        for days in test_values:
            with patch.dict(os.environ, {"LOTTO_WINDOW_DAYS": str(days)}):
                s = Settings()
                assert s.lotto_window_days == days

    def test_negative_values_validation(self):
        """Test that negative values are accepted (validation happens at usage)."""
        with patch.dict(os.environ, {"RATE_LIMIT_MAX": "-1"}):
            s = Settings()
            assert s.rate_limit_max == -1  # Pydantic accepts negatives