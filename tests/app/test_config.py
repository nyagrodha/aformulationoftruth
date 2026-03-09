"""Tests for app/config.py configuration settings."""

import os
import pytest
from unittest.mock import patch
from pydantic import ValidationError

from app.config import Settings, settings


class TestSettings:
    """Tests for Settings configuration class."""

    def test_settings_default_values(self):
        """Test that Settings initializes with correct default values."""
        s = Settings()
        assert s.database_url == ""
        assert s.database_url_primary == ""
        assert s.database_url_secondary == ""
        assert s.database_url_local == ""
        assert s.age_recipient == ""
        assert s.hmac_secret == ""
        assert s.session_secret == ""
        assert s.bind_addr == "127.0.0.1:8787"
        assert s.gate_api_key == ""
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

    def test_settings_with_env_vars(self):
        """Test that Settings loads values from environment variables."""
        with patch.dict(os.environ, {
            "DATABASE_URL": "postgresql://user:pass@localhost/db",
            "AGE_RECIPIENT": "age1test123",
            "HMAC_SECRET": "test_hmac_secret",
            "SESSION_SECRET": "test_session_secret",
            "BIND_ADDR": "0.0.0.0:9000",
            "GATE_API_KEY": "test_api_key",
            "RATE_LIMIT_WINDOW": "120",
            "RATE_LIMIT_MAX": "20",
            "SESSION_MAX_AGE": "43200",
        }):
            s = Settings()
            assert s.database_url == "postgresql://user:pass@localhost/db"
            assert s.age_recipient == "age1test123"
            assert s.hmac_secret == "test_hmac_secret"
            assert s.session_secret == "test_session_secret"
            assert s.bind_addr == "0.0.0.0:9000"
            assert s.gate_api_key == "test_api_key"
            assert s.rate_limit_window == 120
            assert s.rate_limit_max == 20
            assert s.session_max_age == 43200

    def test_lotto_settings_with_env_vars(self):
        """Test that lotto-specific settings load from environment."""
        with patch.dict(os.environ, {
            "LOTTO_MIN_PARTICIPANTS": "30",
            "LOTTO_WINDOW_DAYS": "14",
            "LOTTO_CLAIM_WINDOW_DAYS": "3",
            "LOTTO_DRAND_URL_TEMPLATE": "https://custom.drand.sh/{round}",
            "LOTTO_DEFAULT_DRAND_ROUND_TARGET": "12345",
            "LOTTO_OPERATOR_TOKEN": "op_token_123",
            "LOTTO_OPERATOR_SIGNING_KEY_B64": "YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=",
        }):
            s = Settings()
            assert s.lotto_min_participants == 30
            assert s.lotto_window_days == 14
            assert s.lotto_claim_window_days == 3
            assert s.lotto_drand_url_template == "https://custom.drand.sh/{round}"
            assert s.lotto_default_drand_round_target == 12345
            assert s.lotto_operator_token == "op_token_123"
            assert s.lotto_operator_signing_key_b64 == "YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY="

    def test_settings_case_insensitive(self):
        """Test that environment variable names are case-insensitive."""
        with patch.dict(os.environ, {
            "database_url": "postgresql://test:test@localhost/test",
            "BIND_ADDR": "127.0.0.1:8000",
        }):
            s = Settings()
            assert s.database_url == "postgresql://test:test@localhost/test"
            assert s.bind_addr == "127.0.0.1:8000"

    def test_fresh_api_urls(self):
        """Test Fresh API URL configuration."""
        with patch.dict(os.environ, {
            "FRESH_API_PRIMARY": "http://primary.api:8080",
            "FRESH_API_SECONDARY": "http://secondary.api:8080",
            "FRESH_API_LOCAL": "http://localhost:8080",
            "FRESH_API_DOMAIN": "https://api.example.com",
        }):
            s = Settings()
            assert s.fresh_api_primary == "http://primary.api:8080"
            assert s.fresh_api_secondary == "http://secondary.api:8080"
            assert s.fresh_api_local == "http://localhost:8080"
            assert s.fresh_api_domain == "https://api.example.com"

    def test_database_urls_fallback_chain(self):
        """Test database URL fallback chain configuration."""
        with patch.dict(os.environ, {
            "DATABASE_URL_PRIMARY": "postgresql://vpn-db/gate",
            "DATABASE_URL_SECONDARY": "postgresql://domain-db/gate",
            "DATABASE_URL_LOCAL": "postgresql://localhost/gate",
        }):
            s = Settings()
            assert s.database_url_primary == "postgresql://vpn-db/gate"
            assert s.database_url_secondary == "postgresql://domain-db/gate"
            assert s.database_url_local == "postgresql://localhost/gate"

    def test_settings_singleton_instance(self):
        """Test that the global settings instance exists."""
        assert settings is not None
        assert isinstance(settings, Settings)

    def test_rate_limit_defaults(self):
        """Test rate limiting defaults."""
        s = Settings()
        assert s.rate_limit_window == 60
        assert s.rate_limit_max == 10

    def test_session_defaults(self):
        """Test session configuration defaults."""
        s = Settings()
        assert s.session_max_age == 86400  # 24 hours

    def test_lotto_protocol_defaults(self):
        """Test lottery protocol defaults."""
        s = Settings()
        assert s.lotto_min_participants == 15
        assert s.lotto_window_days == 21
        assert s.lotto_claim_window_days == 7
        assert "drand.sh" in s.lotto_drand_url_template
        assert "{round}" in s.lotto_drand_url_template

    def test_empty_strings_allowed(self):
        """Test that empty strings are valid for optional fields."""
        s = Settings()
        # These should be empty strings by default
        assert s.database_url == ""
        assert s.age_recipient == ""
        assert s.hmac_secret == ""
        assert s.session_secret == ""
        assert s.gate_api_key == ""

    def test_integer_field_validation(self):
        """Test that integer fields validate correctly."""
        with patch.dict(os.environ, {
            "RATE_LIMIT_WINDOW": "invalid",
        }):
            with pytest.raises(ValidationError):
                Settings()

    def test_negative_integers_allowed(self):
        """Test that negative integers are handled (may or may not be valid)."""
        with patch.dict(os.environ, {
            "LOTTO_MIN_PARTICIPANTS": "-1",
        }):
            s = Settings()
            # Pydantic will coerce this to an integer
            assert s.lotto_min_participants == -1

    def test_zero_values_allowed(self):
        """Test that zero values are permitted for integer fields."""
        with patch.dict(os.environ, {
            "LOTTO_DEFAULT_DRAND_ROUND_TARGET": "0",
            "RATE_LIMIT_MAX": "0",
        }):
            s = Settings()
            assert s.lotto_default_drand_round_target == 0
            assert s.rate_limit_max == 0

    def test_large_integer_values(self):
        """Test handling of large integer values."""
        with patch.dict(os.environ, {
            "SESSION_MAX_AGE": "2592000",  # 30 days
            "LOTTO_DEFAULT_DRAND_ROUND_TARGET": "99999999",
        }):
            s = Settings()
            assert s.session_max_age == 2592000
            assert s.lotto_default_drand_round_target == 99999999

    def test_url_template_formatting(self):
        """Test that URL template is correctly formatted."""
        s = Settings()
        # Should contain placeholder
        assert "{round}" in s.lotto_drand_url_template
        # Should be a valid URL prefix
        assert s.lotto_drand_url_template.startswith("http")

    def test_bind_address_format(self):
        """Test bind address format variations."""
        test_cases = [
            ("127.0.0.1:8787", "127.0.0.1:8787"),
            ("0.0.0.0:80", "0.0.0.0:80"),
            ("localhost:3000", "localhost:3000"),
            ("[::1]:8080", "[::1]:8080"),  # IPv6
        ]
        for env_value, expected in test_cases:
            with patch.dict(os.environ, {"BIND_ADDR": env_value}):
                s = Settings()
                assert s.bind_addr == expected

    def test_base64_key_format(self):
        """Test that base64 encoded keys are stored as strings."""
        test_key = "dGVzdGtleXRoYXRpc2Jhc2U2NGVuY29kZWQ="
        with patch.dict(os.environ, {
            "LOTTO_OPERATOR_SIGNING_KEY_B64": test_key,
        }):
            s = Settings()
            assert s.lotto_operator_signing_key_b64 == test_key
            assert isinstance(s.lotto_operator_signing_key_b64, str)

    def test_multiple_database_url_configs(self):
        """Test that multiple database URL configurations can coexist."""
        with patch.dict(os.environ, {
            "DATABASE_URL": "postgresql://main/db",
            "DATABASE_URL_PRIMARY": "postgresql://primary/db",
            "DATABASE_URL_SECONDARY": "postgresql://secondary/db",
            "DATABASE_URL_LOCAL": "postgresql://local/db",
        }):
            s = Settings()
            assert s.database_url == "postgresql://main/db"
            assert s.database_url_primary == "postgresql://primary/db"
            assert s.database_url_secondary == "postgresql://secondary/db"
            assert s.database_url_local == "postgresql://local/db"

    def test_settings_immutability_after_creation(self):
        """Test that settings can be modified after creation (Pydantic allows this by default)."""
        s = Settings()
        original_value = s.bind_addr
        s.bind_addr = "new.address:9999"
        assert s.bind_addr == "new.address:9999"
        assert s.bind_addr != original_value

    def test_model_config_settings(self):
        """Test that model configuration is correct."""
        s = Settings()
        # The model config should have empty prefix and be case insensitive
        assert s.model_config["env_prefix"] == ""
        assert s.model_config["case_sensitive"] is False