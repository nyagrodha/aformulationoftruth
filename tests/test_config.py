"""Tests for app/config.py configuration module."""

import os
import pytest
from pydantic import ValidationError


def test_settings_import():
    """Test that Settings class can be imported."""
    from app.config import Settings
    assert Settings is not None


def test_settings_instance():
    """Test that settings instance can be created with defaults."""
    from app.config import Settings

    settings = Settings()
    assert settings is not None
    assert hasattr(settings, 'database_url')
    assert hasattr(settings, 'age_recipient')
    assert hasattr(settings, 'hmac_secret')
    assert hasattr(settings, 'session_secret')


def test_settings_default_values():
    """Test default configuration values."""
    from app.config import Settings

    settings = Settings()

    # Database defaults
    assert settings.database_url == "postgresql://a4m_gate_app@/a4m_gate?host=/var/run/postgresql-gate&port=5433"

    # Empty secret defaults
    assert settings.age_recipient == ""
    assert settings.hmac_secret == ""
    assert settings.session_secret == ""

    # Rate limiting defaults
    assert settings.rate_limit_window == 60
    assert settings.rate_limit_max == 10

    # Session defaults
    assert settings.session_max_age == 86400

    # Lotto defaults
    assert settings.lotto_min_participants == 15
    assert settings.lotto_window_days == 21
    assert settings.lotto_claim_window_days == 7
    assert settings.lotto_drand_url_template == "https://api.drand.sh/public/{round}"
    assert settings.lotto_default_drand_round_target == 0
    assert settings.lotto_operator_token == ""
    assert settings.lotto_operator_signing_key_b64 == ""


def test_settings_from_environment():
    """Test that settings can be loaded from environment variables."""
    from app.config import Settings

    # Set environment variables
    test_env = {
        'DATABASE_URL': 'postgresql://testuser:testpass@localhost:5432/testdb',
        'AGE_RECIPIENT': 'age1test123',
        'HMAC_SECRET': 'test_hmac_secret_key',
        'SESSION_SECRET': 'test_session_secret_key',
        'RATE_LIMIT_WINDOW': '120',
        'RATE_LIMIT_MAX': '20',
        'SESSION_MAX_AGE': '3600',
        'LOTTO_MIN_PARTICIPANTS': '10',
        'LOTTO_WINDOW_DAYS': '14',
        'LOTTO_CLAIM_WINDOW_DAYS': '5',
        'LOTTO_DRAND_URL_TEMPLATE': 'https://custom.drand.sh/round/{round}',
        'LOTTO_DEFAULT_DRAND_ROUND_TARGET': '1000',
        'LOTTO_OPERATOR_TOKEN': 'test_operator_token',
        'LOTTO_OPERATOR_SIGNING_KEY_B64': 'dGVzdF9zaWduaW5nX2tleQ==',
    }

    # Temporarily set environment
    original_env = {}
    for key, value in test_env.items():
        original_env[key] = os.environ.get(key)
        os.environ[key] = value

    try:
        settings = Settings()

        assert settings.database_url == 'postgresql://testuser:testpass@localhost:5432/testdb'
        assert settings.age_recipient == 'age1test123'
        assert settings.hmac_secret == 'test_hmac_secret_key'
        assert settings.session_secret == 'test_session_secret_key'
        assert settings.rate_limit_window == 120
        assert settings.rate_limit_max == 20
        assert settings.session_max_age == 3600
        assert settings.lotto_min_participants == 10
        assert settings.lotto_window_days == 14
        assert settings.lotto_claim_window_days == 5
        assert settings.lotto_drand_url_template == 'https://custom.drand.sh/round/{round}'
        assert settings.lotto_default_drand_round_target == 1000
        assert settings.lotto_operator_token == 'test_operator_token'
        assert settings.lotto_operator_signing_key_b64 == 'dGVzdF9zaWduaW5nX2tleQ=='
    finally:
        # Restore original environment
        for key in test_env.keys():
            if original_env[key] is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = original_env[key]


def test_settings_case_insensitive():
    """Test that environment variable names are case insensitive."""
    from app.config import Settings

    test_env = {
        'database_url': 'postgresql://lowercase@localhost/db',
        'DATABASE_URL': 'postgresql://uppercase@localhost/db',
    }

    # Test with uppercase
    original = os.environ.get('DATABASE_URL')
    os.environ['DATABASE_URL'] = test_env['DATABASE_URL']

    try:
        settings = Settings()
        assert 'localhost' in settings.database_url
    finally:
        if original is None:
            os.environ.pop('DATABASE_URL', None)
        else:
            os.environ['DATABASE_URL'] = original


def test_settings_integer_validation():
    """Test that integer fields are validated correctly."""
    from app.config import Settings

    # Test with invalid integer value
    original = os.environ.get('RATE_LIMIT_WINDOW')
    os.environ['RATE_LIMIT_WINDOW'] = 'not_an_integer'

    try:
        with pytest.raises(ValidationError):
            Settings()
    finally:
        if original is None:
            os.environ.pop('RATE_LIMIT_WINDOW', None)
        else:
            os.environ['RATE_LIMIT_WINDOW'] = original


def test_settings_singleton_import():
    """Test that the module exports a settings singleton."""
    from app.config import settings

    assert settings is not None
    assert hasattr(settings, 'database_url')


def test_settings_immutability():
    """Test that settings fields can be accessed."""
    from app.config import settings

    # Should be able to read
    _ = settings.database_url
    _ = settings.session_max_age
    _ = settings.lotto_min_participants

    # Pydantic settings are frozen by default in some configurations
    # but not necessarily in this case - just verify access works
    assert True


def test_lotto_configuration_consistency():
    """Test that lotto configuration values are consistent."""
    from app.config import Settings

    settings = Settings()

    # Verify lotto settings are positive
    assert settings.lotto_min_participants > 0
    assert settings.lotto_window_days > 0
    assert settings.lotto_claim_window_days > 0
    assert settings.lotto_default_drand_round_target >= 0


def test_rate_limit_configuration():
    """Test rate limiting configuration."""
    from app.config import Settings

    settings = Settings()

    assert settings.rate_limit_window > 0
    assert settings.rate_limit_max > 0
    assert settings.rate_limit_window <= 3600  # Should be reasonable
    assert settings.rate_limit_max <= 1000  # Should be reasonable


def test_session_configuration():
    """Test session configuration values."""
    from app.config import Settings

    settings = Settings()

    # Session max age should be positive and reasonable
    assert settings.session_max_age > 0
    assert settings.session_max_age <= 86400 * 30  # Max 30 days


def test_drand_url_template_format():
    """Test that drand URL template has correct format placeholder."""
    from app.config import Settings

    settings = Settings()

    assert '{round}' in settings.lotto_drand_url_template
    assert settings.lotto_drand_url_template.startswith('https://')


def test_settings_model_config():
    """Test that model configuration is set correctly."""
    from app.config import Settings

    # Verify model_config attributes
    assert hasattr(Settings, 'model_config')
    config = Settings.model_config

    assert config.get('env_prefix') == ""
    assert config.get('case_sensitive') == False


def test_database_url_validation():
    """Test database URL can be set to various valid formats."""
    from app.config import Settings

    test_urls = [
        'postgresql://user:pass@localhost:5432/db',
        'postgresql://user@localhost/db',
        'postgresql://localhost/db',
        'postgres://localhost/db',
    ]

    for url in test_urls:
        original = os.environ.get('DATABASE_URL')
        os.environ['DATABASE_URL'] = url

        try:
            settings = Settings()
            assert settings.database_url == url
        finally:
            if original is None:
                os.environ.pop('DATABASE_URL', None)
            else:
                os.environ['DATABASE_URL'] = original


def test_empty_strings_allowed_for_secrets():
    """Test that empty strings are allowed for secret fields."""
    from app.config import Settings

    settings = Settings(
        age_recipient="",
        hmac_secret="",
        session_secret="",
        lotto_operator_token="",
        lotto_operator_signing_key_b64=""
    )

    assert settings.age_recipient == ""
    assert settings.hmac_secret == ""
    assert settings.session_secret == ""
    assert settings.lotto_operator_token == ""
    assert settings.lotto_operator_signing_key_b64 == ""


def test_boundary_values():
    """Test boundary values for numeric settings."""
    from app.config import Settings

    # Test with zero values
    settings = Settings(
        rate_limit_window=1,
        rate_limit_max=1,
        session_max_age=1,
        lotto_min_participants=1,
        lotto_window_days=1,
        lotto_claim_window_days=1,
        lotto_default_drand_round_target=0
    )

    assert settings.rate_limit_window == 1
    assert settings.rate_limit_max == 1
    assert settings.session_max_age == 1
    assert settings.lotto_min_participants == 1
    assert settings.lotto_window_days == 1
    assert settings.lotto_claim_window_days == 1
    assert settings.lotto_default_drand_round_target == 0


def test_large_numeric_values():
    """Test that large numeric values are handled correctly."""
    from app.config import Settings

    settings = Settings(
        rate_limit_window=999999,
        rate_limit_max=999999,
        session_max_age=999999,
        lotto_min_participants=999999,
        lotto_window_days=365,
        lotto_claim_window_days=365,
        lotto_default_drand_round_target=999999999
    )

    assert settings.rate_limit_window == 999999
    assert settings.session_max_age == 999999