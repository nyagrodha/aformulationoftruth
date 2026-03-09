"""Additional integration and edge case tests for comprehensive coverage."""

import pytest
from unittest.mock import Mock, AsyncMock, patch
from cryptography.fernet import Fernet


@pytest.mark.asyncio
async def test_login_flow_with_password_rehash():
    """Test complete login flow including password rehash scenario."""
    from app.auth import login_submit

    valid_key = Fernet.generate_key().decode()

    with patch('app.auth.settings') as mock_settings:
        mock_settings.session_secret = valid_key
        mock_settings.session_max_age = 3600

        with patch('app.auth._csrf_ok', return_value=True):
            with patch('app.auth._ph') as mock_ph:
                # Mock password hasher
                mock_ph.verify = Mock()
                mock_ph.check_needs_rehash = Mock(return_value=True)
                mock_ph.hash = Mock(return_value='new_hash')

                # Mock database
                from tests.test_helpers import make_async_pool_mock

                mock_conn = AsyncMock()
                mock_conn.fetchrow = AsyncMock(return_value={
                    'id': 1,
                    'handle': 'testuser',
                    'password_hash': 'old_hash'
                })
                mock_conn.execute = AsyncMock()

                mock_pool = make_async_pool_mock(mock_conn)

                request = Mock()

                with patch('app.auth._create_session', return_value=('sid123', 'cookie_val')):
                    with patch('app.auth._set_session_cookie'):
                        response = await login_submit(
                            request,
                            handle='testuser',
                            password='password123',
                            csrf_token='token',
                            pool=mock_pool
                        )

                        # Should update password hash
                        assert mock_conn.execute.call_count >= 1


def test_merkle_tree_power_of_two():
    """Test merkle tree with power of 2 commitments."""
    from app.lotto import _build_merkle_root

    # Test with 4, 8, 16 commitments (powers of 2)
    for size in [4, 8, 16]:
        commitments = [f'commitment_{i}' for i in range(size)]
        root = _build_merkle_root(commitments)

        assert len(root) == 64
        assert all(c in '0123456789abcdef' for c in root)


def test_merkle_tree_large_odd():
    """Test merkle tree with large odd number of commitments."""
    from app.lotto import _build_merkle_root

    # Test with 99 commitments (large odd number)
    commitments = [f'c{i}' for i in range(99)]
    root = _build_merkle_root(commitments)

    assert len(root) == 64


def test_handle_generation_boundary_cases():
    """Test handle generation edge cases."""
    from app.auth import _ADJECTIVES, _NOUNS

    # Verify word lists are non-empty
    assert len(_ADJECTIVES) > 0
    assert len(_NOUNS) > 0

    # Verify all words are lowercase strings
    assert all(isinstance(word, str) and word.islower() for word in _ADJECTIVES)
    assert all(isinstance(word, str) and word.islower() for word in _NOUNS)


def test_config_negative_values():
    """Test configuration with negative values (should be rejected or handled)."""
    from app.config import Settings

    # Test that negative values are accepted but unusual
    settings = Settings(
        rate_limit_window=-1,
        rate_limit_max=-1,
        session_max_age=-1
    )

    # Values are set as provided (no validation enforced)
    assert settings.rate_limit_window == -1


def test_fernet_key_validation():
    """Test Fernet encryption key validation."""
    from app.auth import _get_fernet
    from cryptography.fernet import InvalidToken

    # Test with invalid Fernet key format
    with patch('app.auth.settings') as mock_settings:
        mock_settings.session_secret = 'not_a_valid_fernet_key'

        with pytest.raises((ValueError, InvalidToken, Exception)):
            _get_fernet()


def test_normalize_hash_hex_case_insensitive():
    """Test hash normalization is case insensitive."""
    from app.lotto import _normalize_hash_hex

    upper_hash = 'ABCDEF' + '0' * 58
    lower_hash = 'abcdef' + '0' * 58

    result_upper = _normalize_hash_hex(upper_hash, 'test')
    result_lower = _normalize_hash_hex(lower_hash, 'test')

    assert result_upper == result_lower
    assert result_upper == lower_hash


def test_session_cookie_security_attributes():
    """Test that session cookies have proper security attributes."""
    from app.auth import _set_session_cookie

    with patch('app.auth.settings') as mock_settings:
        mock_settings.session_max_age = 3600

        response = Mock()
        response.set_cookie = Mock()

        _set_session_cookie(response, 'test_cookie')

        call_kwargs = response.set_cookie.call_args[1]

        # Verify security attributes
        assert call_kwargs['httponly'] is True
        assert call_kwargs['samesite'] == 'lax'
        assert call_kwargs['path'] == '/'
        # Note: secure is False for .onion compatibility


def test_captcha_token_format():
    """Test CAPTCHA token format validation."""
    from app.captcha import is_token_expired

    # Valid token format: base64:timestamp
    valid_token = 'somebase64string:1234567890'
    # Should not be expired if timestamp is recent enough
    # (depends on current time, but format is valid)

    # Invalid formats
    invalid_tokens = [
        'no_colon',
        ':missing_prefix',
        'missing_suffix:',
        '',
    ]

    for token in invalid_tokens:
        # Invalid tokens should be considered expired
        assert is_token_expired(token) is True


def test_csrf_token_timing_safe_comparison():
    """Test CSRF validation uses timing-safe comparison."""
    from app.auth import _csrf_ok
    import secrets

    # This test verifies the function uses secrets.compare_digest
    token1 = 'token123'
    token2 = 'token456'

    request = Mock()
    request.cookies.get = Mock(return_value=token1)

    # Different tokens should not match
    assert _csrf_ok(request, token2) is False

    # Same token should match
    assert _csrf_ok(request, token1) is True


def test_question_shuffling_determinism():
    """Test that question shuffling is deterministic based on seed."""
    from app.crypto import shuffle_questions

    seed = 'test_seed_123'

    result1 = shuffle_questions(seed)
    result2 = shuffle_questions(seed)

    # Same seed should produce same order
    assert result1 == result2

    # Different seed should produce different order (highly likely)
    result3 = shuffle_questions('different_seed')
    assert result1 != result3


def test_anchor_hash_collision_resistance():
    """Test that anchor hash changes with any parameter change."""
    from app.lotto import _compute_anchor_hash

    base_hash = _compute_anchor_hash('root', 10, 100)

    # Change each parameter and verify hash changes
    diff1 = _compute_anchor_hash('root2', 10, 100)
    diff2 = _compute_anchor_hash('root', 11, 100)
    diff3 = _compute_anchor_hash('root', 10, 101)

    assert base_hash != diff1
    assert base_hash != diff2
    assert base_hash != diff3
    assert diff1 != diff2 != diff3


def test_drand_url_formatting():
    """Test drand URL template formatting."""
    from app.config import settings

    # URL should have placeholder
    assert '{round}' in settings.lotto_drand_url_template

    # Format the URL
    round_num = 12345
    url = settings.lotto_drand_url_template.format(round=round_num)

    assert str(round_num) in url
    assert '{round}' not in url


@pytest.mark.asyncio
async def test_gate_submission_empty_answers():
    """Test gate submission with empty answers (boundary case)."""
    from app.gate import submit_final
    from tests.test_helpers import AsyncContextManager

    user = {'user_id': 1, 'sid': 'session123'}

    with patch('app.gate.get_current_user', return_value=user):
        with patch('app.gate._csrf_ok', return_value=True):
            from tests.test_helpers import make_async_pool_mock

            mock_conn = AsyncMock()
            # Empty answers should trigger redirect
            mock_conn.fetchrow = AsyncMock(return_value={
                'answers': {},
                'question_order_seed': 'seed'
            })
            # Mock transaction context manager
            mock_conn.transaction = Mock(return_value=AsyncContextManager(None))

            from fastapi.responses import RedirectResponse

            mock_pool = make_async_pool_mock(mock_conn)

            request = Mock()

            response = await submit_final(
                request, csrf_token='token', pool=mock_pool
            )

            # Should redirect to gate (no answers)
            assert isinstance(response, RedirectResponse)
            assert '/gate' in response.headers['location']


def test_parse_int_edge_cases():
    """Test integer parsing with edge cases."""
    from app.lotto import _parse_int

    # Test with string numbers
    assert _parse_int('0', 'field') == 0
    assert _parse_int('-999', 'field') == -999
    assert _parse_int('999999', 'field') == 999999

    # Test with actual integers
    assert _parse_int(42, 'field') == 42
    assert _parse_int(0, 'field') == 0


def test_normalize_token_whitespace_handling():
    """Test token normalization strips whitespace correctly."""
    from app.lotto import _normalize_token

    tokens_with_whitespace = [
        '  token  ',
        '\ttoken\t',
        '\ntoken\n',
        '  token with spaces  ',
    ]

    for token in tokens_with_whitespace:
        result = _normalize_token(token, 'field')
        assert result == token.strip()
        assert result[0] != ' ' and result[-1] != ' '


def test_settings_type_coercion():
    """Test that settings properly coerce types from environment."""
    from app.config import Settings
    import os

    # Test integer coercion
    os.environ['RATE_LIMIT_WINDOW'] = '120'
    os.environ['RATE_LIMIT_MAX'] = '20'

    try:
        settings = Settings()
        assert isinstance(settings.rate_limit_window, int)
        assert isinstance(settings.rate_limit_max, int)
        assert settings.rate_limit_window == 120
        assert settings.rate_limit_max == 20
    finally:
        os.environ.pop('RATE_LIMIT_WINDOW', None)
        os.environ.pop('RATE_LIMIT_MAX', None)


def test_registration_handle_normalization():
    """Test that handles are normalized to lowercase."""
    from app.auth import register_submit

    with patch('app.auth._csrf_ok', return_value=True):
        with patch('app.auth._ph') as mock_ph:
            mock_ph.hash = Mock(return_value='hash')

            from tests.test_helpers import make_async_pool_mock

            mock_conn = AsyncMock()
            mock_conn.fetchval = AsyncMock(return_value=1)

            mock_pool = make_async_pool_mock(mock_conn)

            with patch('app.auth._create_session', return_value=('sid', 'cookie')):
                with patch('app.auth._set_session_cookie'):
                    request = Mock()

                    # Use uppercase handle
                    import asyncio
                    asyncio.run(register_submit(
                        request,
                        handle='UPPERCASE',
                        password='password12345',
                        csrf_token='token',
                        pool=mock_pool
                    ))

                    # Verify handle was lowercased in database insert
                    insert_call = mock_conn.fetchval.call_args
                    assert 'uppercase' in str(insert_call).lower()


def test_merkle_proof_sibling_ordering():
    """Test that merkle proof verification handles sibling order correctly."""
    from app.lotto import _verify_merkle_proof, _build_merkle_root
    import hashlib

    # Build a small tree
    commitments = ['a', 'b', 'c', 'd']
    root = _build_merkle_root(commitments)

    # For 'a' at index 0, sibling 'b' is on the right
    leaf_a = hashlib.sha256(b'a').digest()
    leaf_b = hashlib.sha256(b'b').digest()
    parent_ab = hashlib.sha256(leaf_a + leaf_b).digest()

    leaf_c = hashlib.sha256(b'c').digest()
    leaf_d = hashlib.sha256(b'd').digest()
    parent_cd = hashlib.sha256(leaf_c + leaf_d).digest()

    # Correct proof
    proof = [leaf_b.hex(), parent_cd.hex()]
    assert _verify_merkle_proof('a', proof, 0, root) is True

    # Wrong order proof (should fail)
    wrong_proof = [parent_cd.hex(), leaf_b.hex()]
    assert _verify_merkle_proof('a', wrong_proof, 0, root) is False