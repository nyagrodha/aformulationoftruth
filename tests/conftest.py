"""Pytest configuration and fixtures."""

import sys
from unittest.mock import MagicMock

# Mock missing dependencies before any imports
mock_modules = [
    'fastapi',
    'fastapi.responses',
    'fastapi.staticfiles',
    'fastapi.templating',
    'asyncpg',
    'cryptography',
    'cryptography.hazmat',
    'cryptography.hazmat.primitives',
    'cryptography.hazmat.primitives.asymmetric',
    'cryptography.hazmat.primitives.asymmetric.ed25519',
    'cryptography.hazmat.primitives.serialization',
]

for mod_name in mock_modules:
    if mod_name not in sys.modules:
        sys.modules[mod_name] = MagicMock()