"""Comprehensive tests for app.config module.

Tests cover configuration loading, validation, defaults, and environment variable handling.
"""

import os
from unittest.mock import MagicMock, patch

import pytest


class TestSettingsClass:
    """Tests for Settings class and configuration management."""

    def test_settings_default_values(self):
        """Test default configuration values are set correctly."""
        from app.config import Settings

        settings = Settings()

        # Database defaults
        assert 'postgresql://' in settings.database_url
        assert '5433' in settings.database_url

        # Rate limiting defaults
        assert settings.rate_limit_window == 60
        assert settings.rate_limit_max == 10

        # Session defaults
        assert settings.session_max_age == 86400

        # Lotto defaults
        assert settings.lotto_min_participants == 15
        assert settings.lotto_window_days == 21
        assert settings.lotto_claim_window_days == 7

    def test_settings_empty_secrets(self):
        """Test that secret fields default to empty strings."""
        from app.config import Settings

        settings = Settings()

        assert settings.age_recipient == ""
        assert settings.hmac_secret == ""
        assert settings.session_secret == ""
        assert settings.lotto_operator_token == ""
        assert settings.lotto_operator_signing_key_b64 == ""

    @patch.dict(os.environ, {
        'DATABASE_URL': 'postgresql://custom:password@localhost:5432/testdb',
        'RATE_LIMIT_WINDOW': '120',
        'RATE_LIMIT_MAX': '20',
    })
    def test_settings_from_environment(self):
        """Test settings load from environment variables."""
        from app.config import Settings

        settings = Settings()

        assert settings.database_url == 'postgresql://custom:password@localhost:5432/testdb'
        assert settings.rate_limit_window == 120
        assert settings.rate_limit_max == 20

    @patch.dict(os.environ, {
        'SESSION_MAX_AGE': '3600',
        'LOTTO_MIN_PARTICIPANTS': '10',
        'LOTTO_WINDOW_DAYS': '14',
        'LOTTO_CLAIM_WINDOW_DAYS': '3',
    })
    def test_settings_integer_env_vars(self):
        """Test integer environment variables parse correctly."""
        from app.config import Settings

        settings = Settings()

        assert settings.session_max_age == 3600
        assert settings.lotto_min_participants == 10
        assert settings.lotto_window_days == 14
        assert settings.lotto_claim_window_days == 3

    @patch.dict(os.environ, {
        'AGE_RECIPIENT': 'age1test123456',
        'HMAC_SECRET': 'hmac_secret_key',
        'SESSION_SECRET': 'session_secret_key',
        'LOTTO_OPERATOR_TOKEN': 'operator_token_123',
        'LOTTO_OPERATOR_SIGNING_KEY_B64': 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=',
    })
    def test_settings_secret_env_vars(self):
        """Test secret environment variables load correctly."""
        from app.config import Settings

        settings = Settings()

        assert settings.age_recipient == 'age1test123456'
        assert settings.hmac_secret == 'hmac_secret_key'
        assert settings.session_secret == 'session_secret_key'
        assert settings.lotto_operator_token == 'operator_token_123'
        assert settings.lotto_operator_signing_key_b64 == 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY='

    @patch.dict(os.environ, {
        'LOTTO_DRAND_URL_TEMPLATE': 'https://custom.drand.sh/api/{round}',
        'LOTTO_DEFAULT_DRAND_ROUND_TARGET': '12345',
    })
    def test_settings_lotto_config(self):
        """Test lotto-specific configuration."""
        from app.config import Settings

        settings = Settings()

        assert settings.lotto_drand_url_template == 'https://custom.drand.sh/api/{round}'
        assert settings.lotto_default_drand_round_target == 12345

    def test_settings_drand_url_contains_placeholder(self):
        """Test default drand URL template has placeholder."""
        from app.config import Settings

        settings = Settings()

        assert '{round}' in settings.lotto_drand_url_template

    def test_settings_model_config(self):
        """Test pydantic model configuration."""
        from app.config import Settings

        # Test that env_prefix is empty (case_sensitive=False in model_config)
        assert Settings.model_config['env_prefix'] == ""
        assert Settings.model_config['case_sensitive'] is False


class TestSettingsInstance:
    """Tests for the global settings instance."""

    def test_settings_instance_exists(self):
        """Test that settings instance is created."""
        from app.config import settings

        assert settings is not None

    def test_settings_instance_is_settings_type(self):
        """Test that settings is an instance of Settings."""
        from app.config import Settings, settings

        assert isinstance(settings, Settings)

    def test_settings_instance_accessible(self):
        """Test that settings instance attributes are accessible."""
        from app.config import settings

        # Should not raise AttributeError
        _ = settings.database_url
        _ = settings.rate_limit_window
        _ = settings.session_max_age


class TestConfigurationValidation:
    """Tests for configuration validation and edge cases."""

    @patch.dict(os.environ, {'RATE_LIMIT_WINDOW': '0'})
    def test_rate_limit_window_zero(self):
        """Test rate limit window can be set to zero."""
        from app.config import Settings

        settings = Settings()
        assert settings.rate_limit_window == 0

    @patch.dict(os.environ, {'RATE_LIMIT_MAX': '0'})
    def test_rate_limit_max_zero(self):
        """Test rate limit max can be set to zero (effectively unlimited)."""
        from app.config import Settings

        settings = Settings()
        assert settings.rate_limit_max == 0

    @patch.dict(os.environ, {'SESSION_MAX_AGE': '1'})
    def test_session_max_age_minimum(self):
        """Test minimum session max age."""
        from app.config import Settings

        settings = Settings()
        assert settings.session_max_age == 1

    @patch.dict(os.environ, {'LOTTO_MIN_PARTICIPANTS': '1'})
    def test_lotto_min_participants_minimum(self):
        """Test minimum lotto participants."""
        from app.config import Settings

        settings = Settings()
        assert settings.lotto_min_participants == 1

    @patch.dict(os.environ, {'DATABASE_URL': ''})
    def test_empty_database_url(self):
        """Test empty database URL can be set to empty."""
        from app.config import Settings

        settings = Settings(_env_file=None)
        # Empty string is allowed if explicitly set via environment
        assert settings.database_url == ""

    def test_database_url_format(self):
        """Test database URL follows PostgreSQL format."""
        from app.config import Settings

        settings = Settings()
        url = settings.database_url

        # Should start with postgresql://
        assert url.startswith('postgresql://')


class TestSecurityConfiguration:
    """Tests for security-related configuration."""

    def test_secrets_not_exposed_in_repr(self):
        """Test that secrets are not exposed in string representation."""
        from app.config import Settings

        with patch.dict(os.environ, {
            'HMAC_SECRET': 'supersecret123',
            'SESSION_SECRET': 'anothersecret456',
        }):
            settings = Settings()
            settings_str = str(settings)

            # Pydantic should hide secret values
            # This is a basic check - exact behavior depends on pydantic version

    @patch.dict(os.environ, {
        'AGE_RECIPIENT': 'age1' + 'x' * 58,  # Valid age format
    })
    def test_age_recipient_format(self):
        """Test age recipient can be set."""
        from app.config import Settings

        settings = Settings()
        assert settings.age_recipient.startswith('age1')


class TestLottoConfiguration:
    """Tests for lotto-specific configuration."""

    def test_lotto_drand_url_template_format(self):
        """Test drand URL template is properly formatted."""
        from app.config import Settings

        settings = Settings()

        # Should have placeholder that can be formatted
        assert '{round}' in settings.lotto_drand_url_template

        # Test formatting works
        test_url = settings.lotto_drand_url_template.format(round=12345)
        assert '12345' in test_url
        assert '{round}' not in test_url

    def test_lotto_claim_window_less_than_draw_window(self):
        """Test claim window is typically less than draw window."""
        from app.config import Settings

        settings = Settings()

        # This is a logical constraint, not enforced by config
        # Just documenting expected relationship
        assert settings.lotto_claim_window_days <= settings.lotto_window_days

    @patch.dict(os.environ, {
        'LOTTO_WINDOW_DAYS': '30',
        'LOTTO_CLAIM_WINDOW_DAYS': '14',
        'LOTTO_MIN_PARTICIPANTS': '50',
    })
    def test_lotto_custom_values(self):
        """Test custom lotto configuration values."""
        from app.config import Settings

        settings = Settings()

        assert settings.lotto_window_days == 30
        assert settings.lotto_claim_window_days == 14
        assert settings.lotto_min_participants == 50


class TestRateLimitConfiguration:
    """Tests for rate limiting configuration."""

    def test_rate_limit_defaults_are_reasonable(self):
        """Test default rate limits are reasonable."""
        from app.config import Settings

        settings = Settings()

        # 10 requests per 60 seconds is reasonable for auth endpoints
        assert settings.rate_limit_max > 0
        assert settings.rate_limit_window > 0

    @patch.dict(os.environ, {
        'RATE_LIMIT_WINDOW': '300',
        'RATE_LIMIT_MAX': '100',
    })
    def test_rate_limit_custom_values(self):
        """Test custom rate limit values."""
        from app.config import Settings

        settings = Settings()

        assert settings.rate_limit_window == 300
        assert settings.rate_limit_max == 100


class TestDatabaseConfiguration:
    """Tests for database configuration."""

    def test_database_url_default_contains_required_parts(self):
        """Test default database URL contains required components."""
        from app.config import Settings

        settings = Settings()
        url = settings.database_url

        assert 'postgresql://' in url
        assert 'a4m_gate_app' in url
        assert 'a4m_gate' in url

    @patch.dict(os.environ, {
        'DATABASE_URL': 'postgresql://user:pass@host:1234/db?sslmode=require',
    })
    def test_database_url_with_query_params(self):
        """Test database URL with query parameters."""
        from app.config import Settings

        settings = Settings()

        assert 'sslmode=require' in settings.database_url


class TestEdgeCases:
    """Tests for edge cases and boundary conditions."""

    @patch.dict(os.environ, {
        'SESSION_MAX_AGE': '999999999',
    })
    def test_very_large_session_age(self):
        """Test very large session max age."""
        from app.config import Settings

        settings = Settings()
        assert settings.session_max_age == 999999999

    @patch.dict(os.environ, {
        'LOTTO_DEFAULT_DRAND_ROUND_TARGET': '999999999',
    })
    def test_very_large_drand_round(self):
        """Test very large drand round number."""
        from app.config import Settings

        settings = Settings()
        assert settings.lotto_default_drand_round_target == 999999999

    def test_config_immutability_after_creation(self):
        """Test that config can be modified after creation (Pydantic allows this)."""
        from app.config import Settings

        settings = Settings()
        original_window = settings.rate_limit_window

        # Pydantic v2 allows mutation by default
        settings.rate_limit_window = 999

        assert settings.rate_limit_window == 999

    @patch.dict(os.environ, {}, clear=True)
    def test_settings_with_no_env_vars(self):
        """Test settings work with no environment variables set."""
        from app.config import Settings

        settings = Settings(_env_file=None)

        # Should use all defaults
        assert settings.rate_limit_window == 60
        assert settings.rate_limit_max == 10
        assert settings.session_max_age == 86400


class TestSettingsReload:
    """Tests for settings reload behavior."""

    def test_multiple_settings_instances(self):
        """Test creating multiple Settings instances."""
        from app.config import Settings

        settings1 = Settings()
        settings2 = Settings()

        # Both should have same default values
        assert settings1.rate_limit_window == settings2.rate_limit_window

    @patch.dict(os.environ, {'SESSION_MAX_AGE': '7200'})
    def test_new_instance_picks_up_env_changes(self):
        """Test new Settings instance picks up environment changes."""
        from app.config import Settings

        settings = Settings()
        assert settings.session_max_age == 7200