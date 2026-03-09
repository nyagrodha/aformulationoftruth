"""Pytest configuration and fixtures.

This file provides common test fixtures and mocks for missing dependency modules.
"""

import sys
from unittest.mock import MagicMock

import pytest


# Mock missing app modules that are imported but don't exist as files
sys.modules['app.crypto'] = MagicMock()
sys.modules['app.db'] = MagicMock()
sys.modules['app.captcha'] = MagicMock()
sys.modules['app.middleware'] = MagicMock()
sys.modules['app.questions'] = MagicMock()

# Configure pytest-asyncio
pytest_plugins = ('pytest_asyncio',)


@pytest.fixture
def anyio_backend():
    """Use asyncio as the async backend."""
    return 'asyncio'