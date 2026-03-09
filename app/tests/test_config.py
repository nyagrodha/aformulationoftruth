"""Tests for app/config.py - Configuration management."""

import pytest
from unittest.mock import patch
import os


def test_settings_class_exists():
    """Test that Settings class can be imported and instantiated."""
    from app.config import Settings

    settings = Settings()
    assert settings is not None


def test_settings_default_values():
    """Test that Settings has expected default values."""
    from app.config import Settings

    settings = Settings()

    # Database URLs default to empty
    assert settings.database_url == ""
    assert settings.database_url_primary == ""
    assert settings.database_url_secondary == ""
    assert settings.database_url_local == ""

    # Secrets default to empty
    assert settings.age_recipient == ""
    assert settings.hmac_secret == ""
    assert settings.session_secret == ""
    assert settings.gate_api_key == ""

    # Bind address has a default
    assert settings.bind_addr == "127.0.0.1:8787"

    # Rate limiting defaults
    assert settings.rate_limit_window == 60
    assert settings.rate_limit_max == 10

    # Session defaults
    assert settings.session_max_age == 86400


def test_settings_lotto_defaults():
    """Test that lotto-related settings have correct defaults."""
    from app.config import Settings

    settings = Settings()

    assert settings.lotto_min_participants == 15
    assert settings.lotto_window_days == 21
    assert settings.lotto_claim_window_days == 7
    assert settings.lotto_drand_url_template == "https://api.drand.sh/public/{round}"
    assert settings.lotto_default_drand_round_target == 0
    assert settings.lotto_operator_token == ""
    assert settings.lotto_operator_signing_key_b64 == ""


def test_settings_from_environment():
    """Test that Settings correctly reads from environment variables."""
    from app.config import Settings

    with patch.dict(os.environ, {
        'DATABASE_URL': 'postgresql://testdb',
        'BIND_ADDR': '0.0.0.0:9000',
        'RATE_LIMIT_MAX': '20',
        'SESSION_MAX_AGE': '3600',
    }):
        settings = Settings()

        assert settings.database_url == 'postgresql://testdb'
        assert settings.bind_addr == '0.0.0.0:9000'
        assert settings.rate_limit_max == 20
        assert settings.session_max_age == 3600


def test_settings_case_insensitive():
    """Test that environment variables are case insensitive."""
    from app.config import Settings

    with patch.dict(os.environ, {
        'database_url': 'postgresql://lowercase',
        'RATE_LIMIT_MAX': '15',
    }):
        settings = Settings()

        assert settings.database_url == 'postgresql://lowercase'
        assert settings.rate_limit_max == 15


def test_settings_integer_fields():
    """Test that integer fields are properly typed."""
    from app.config import Settings

    settings = Settings()

    # These should be integers, not strings
    assert isinstance(settings.rate_limit_window, int)
    assert isinstance(settings.rate_limit_max, int)
    assert isinstance(settings.session_max_age, int)
    assert isinstance(settings.lotto_min_participants, int)
    assert isinstance(settings.lotto_window_days, int)
    assert isinstance(settings.lotto_claim_window_days, int)
    assert isinstance(settings.lotto_default_drand_round_target, int)


def test_settings_string_fields():
    """Test that string fields are properly typed."""
    from app.config import Settings

    settings = Settings()

    # These should be strings
    assert isinstance(settings.database_url, str)
    assert isinstance(settings.bind_addr, str)
    assert isinstance(settings.hmac_secret, str)
    assert isinstance(settings.session_secret, str)
    assert isinstance(settings.lotto_drand_url_template, str)


def test_settings_singleton_behavior():
    """Test that settings is instantiated correctly."""
    from app.config import settings, Settings

    # The module should export a settings instance
    assert settings is not None
    assert isinstance(settings, Settings)


def test_settings_fresh_api_urls():
    """Test Fresh API URL configuration fields."""
    from app.config import Settings

    settings = Settings()

    assert settings.fresh_api_primary == ""
    assert settings.fresh_api_secondary == ""
    assert settings.fresh_api_local == ""
    assert settings.fresh_api_domain == ""


def test_settings_lotto_url_template_format():
    """Test that lotto drand URL template has correct format."""
    from app.config import Settings

    settings = Settings()

    # Template should contain {round} placeholder
    assert "{round}" in settings.lotto_drand_url_template
    assert settings.lotto_drand_url_template.startswith("https://")


def test_settings_with_all_env_vars():
    """Test settings with all environment variables set."""
    from app.config import Settings

    env_vars = {
        'DATABASE_URL': 'postgresql://full',
        'DATABASE_URL_PRIMARY': 'postgresql://primary',
        'DATABASE_URL_SECONDARY': 'postgresql://secondary',
        'DATABASE_URL_LOCAL': 'postgresql://local',
        'AGE_RECIPIENT': 'age1test',
        'HMAC_SECRET': 'hmac_test_secret',
        'SESSION_SECRET': 'session_test_secret',
        'BIND_ADDR': '0.0.0.0:8080',
        'GATE_API_KEY': 'test_api_key',
        'FRESH_API_PRIMARY': 'https://primary.example.com',
        'FRESH_API_SECONDARY': 'https://secondary.example.com',
        'FRESH_API_LOCAL': 'http://localhost:8000',
        'FRESH_API_DOMAIN': 'https://example.com',
        'RATE_LIMIT_WINDOW': '120',
        'RATE_LIMIT_MAX': '20',
        'SESSION_MAX_AGE': '7200',
        'LOTTO_MIN_PARTICIPANTS': '30',
        'LOTTO_WINDOW_DAYS': '14',
        'LOTTO_CLAIM_WINDOW_DAYS': '3',
        'LOTTO_DRAND_URL_TEMPLATE': 'https://custom.drand.sh/{round}',
        'LOTTO_DEFAULT_DRAND_ROUND_TARGET': '12345',
        'LOTTO_OPERATOR_TOKEN': 'operator_token',
        'LOTTO_OPERATOR_SIGNING_KEY_B64': 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=',
    }

    with patch.dict(os.environ, env_vars):
        settings = Settings()

        assert settings.database_url == 'postgresql://full'
        assert settings.database_url_primary == 'postgresql://primary'
        assert settings.age_recipient == 'age1test'
        assert settings.hmac_secret == 'hmac_test_secret'
        assert settings.bind_addr == '0.0.0.0:8080'
        assert settings.rate_limit_max == 20
        assert settings.lotto_min_participants == 30
        assert settings.lotto_default_drand_round_target == 12345


def test_settings_partial_env_vars():
    """Test that partial environment variables work with defaults."""
    from app.config import Settings

    with patch.dict(os.environ, {
        'DATABASE_URL': 'postgresql://partial',
        'LOTTO_MIN_PARTICIPANTS': '25',
    }, clear=True):
        settings = Settings()

        # Set values
        assert settings.database_url == 'postgresql://partial'
        assert settings.lotto_min_participants == 25

        # Defaults still work
        assert settings.bind_addr == "127.0.0.1:8787"
        assert settings.rate_limit_max == 10
        assert settings.session_max_age == 86400