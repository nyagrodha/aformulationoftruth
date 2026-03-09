"""Tests for app/lotto.py lottery system module."""

import base64
import hashlib
import json
import pytest
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from datetime import datetime, timedelta, timezone


# Test helper functions


def test_wants_json_with_json_accept_header():
    """Test _wants_json returns True when Accept header contains application/json."""
    from app.lotto import _wants_json

    request = Mock()
    request.headers.get = Mock(side_effect=lambda k, default='': 'application/json' if k == 'accept' else default)

    assert _wants_json(request) is True


def test_wants_json_with_json_content_type():
    """Test _wants_json returns True when Content-Type header contains application/json."""
    from app.lotto import _wants_json

    request = Mock()
    request.headers.get = Mock(side_effect=lambda k, default='': 'application/json' if k == 'content-type' else default)

    assert _wants_json(request) is True


def test_wants_json_without_json_headers():
    """Test _wants_json returns False when neither header contains application/json."""
    from app.lotto import _wants_json

    request = Mock()
    request.headers.get = Mock(return_value='text/html')

    assert _wants_json(request) is False


def test_normalize_token_valid():
    """Test _normalize_token with valid input."""
    from app.lotto import _normalize_token

    result = _normalize_token('  test_token  ', 'field_name')
    assert result == 'test_token'


def test_normalize_token_empty_raises_error():
    """Test _normalize_token raises HTTPException for empty input."""
    from app.lotto import _normalize_token
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        _normalize_token('   ', 'test_field')

    assert exc_info.value.status_code == 400
    assert 'test_field is required' in exc_info.value.detail


def test_normalize_token_too_long_raises_error():
    """Test _normalize_token raises HTTPException for too long input."""
    from app.lotto import _normalize_token
    from fastapi import HTTPException

    long_token = 'a' * 300

    with pytest.raises(HTTPException) as exc_info:
        _normalize_token(long_token, 'test_field', max_len=256)

    assert exc_info.value.status_code == 400
    assert 'test_field is too long' in exc_info.value.detail


def test_normalize_hash_hex_valid():
    """Test _normalize_hash_hex with valid 64-character hex string."""
    from app.lotto import _normalize_hash_hex

    valid_hash = 'a' * 64
    result = _normalize_hash_hex(valid_hash, 'hash_field')
    assert result == valid_hash


def test_normalize_hash_hex_with_0x_prefix():
    """Test _normalize_hash_hex strips 0x prefix."""
    from app.lotto import _normalize_hash_hex

    hash_with_prefix = '0x' + 'a' * 64
    result = _normalize_hash_hex(hash_with_prefix, 'hash_field')
    assert result == 'a' * 64
    assert not result.startswith('0x')


def test_normalize_hash_hex_wrong_length_raises_error():
    """Test _normalize_hash_hex raises HTTPException for wrong length."""
    from app.lotto import _normalize_hash_hex
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        _normalize_hash_hex('abc', 'hash_field')

    assert exc_info.value.status_code == 400
    assert 'must be 32-byte hex' in exc_info.value.detail


def test_normalize_hash_hex_invalid_chars_raises_error():
    """Test _normalize_hash_hex raises HTTPException for non-hex characters."""
    from app.lotto import _normalize_hash_hex
    from fastapi import HTTPException

    invalid_hash = 'g' * 64

    with pytest.raises(HTTPException) as exc_info:
        _normalize_hash_hex(invalid_hash, 'hash_field')

    assert exc_info.value.status_code == 400
    assert 'must be hex' in exc_info.value.detail


def test_parse_int_valid():
    """Test _parse_int with valid integer input."""
    from app.lotto import _parse_int

    assert _parse_int('123', 'field') == 123
    assert _parse_int(456, 'field') == 456
    assert _parse_int('0', 'field') == 0
    assert _parse_int('-42', 'field') == -42


def test_parse_int_invalid_raises_error():
    """Test _parse_int raises HTTPException for invalid input."""
    from app.lotto import _parse_int
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        _parse_int('not_a_number', 'test_field')

    assert exc_info.value.status_code == 400
    assert 'must be an integer' in exc_info.value.detail


def test_hash_bytes():
    """Test _hash_bytes produces consistent SHA256 hashes."""
    from app.lotto import _hash_bytes

    data = b'test data'
    result = _hash_bytes(data)

    expected = hashlib.sha256(data).digest()
    assert result == expected
    assert len(result) == 32


def test_leaf_hash():
    """Test _leaf_hash produces SHA256 hash of commitment string."""
    from app.lotto import _leaf_hash

    commitment = 'test_commitment'
    result = _leaf_hash(commitment)

    expected = hashlib.sha256(commitment.encode('utf-8')).digest()
    assert result == expected


def test_build_merkle_root_single_commitment():
    """Test _build_merkle_root with single commitment."""
    from app.lotto import _build_merkle_root

    commitments = ['commitment1']
    root = _build_merkle_root(commitments)

    # Root should be hex string
    assert isinstance(root, str)
    assert len(root) == 64
    assert all(c in '0123456789abcdef' for c in root)


def test_build_merkle_root_two_commitments():
    """Test _build_merkle_root with two commitments."""
    from app.lotto import _build_merkle_root

    commitments = ['commitment1', 'commitment2']
    root = _build_merkle_root(commitments)

    assert isinstance(root, str)
    assert len(root) == 64


def test_build_merkle_root_odd_number():
    """Test _build_merkle_root with odd number of commitments."""
    from app.lotto import _build_merkle_root

    commitments = ['c1', 'c2', 'c3']
    root = _build_merkle_root(commitments)

    assert isinstance(root, str)
    assert len(root) == 64


def test_build_merkle_root_empty_raises_error():
    """Test _build_merkle_root raises error for empty list."""
    from app.lotto import _build_merkle_root
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        _build_merkle_root([])

    assert exc_info.value.status_code == 400
    assert 'No commitments available' in exc_info.value.detail


def test_build_merkle_root_deterministic():
    """Test _build_merkle_root produces same root for same inputs."""
    from app.lotto import _build_merkle_root

    commitments = ['a', 'b', 'c', 'd']
    root1 = _build_merkle_root(commitments)
    root2 = _build_merkle_root(commitments)

    assert root1 == root2


def test_build_merkle_root_order_matters():
    """Test _build_merkle_root produces different roots for different orders."""
    from app.lotto import _build_merkle_root

    commitments1 = ['a', 'b', 'c']
    commitments2 = ['c', 'b', 'a']

    root1 = _build_merkle_root(commitments1)
    root2 = _build_merkle_root(commitments2)

    assert root1 != root2


def test_verify_merkle_proof_valid():
    """Test _verify_merkle_proof with valid proof."""
    from app.lotto import _verify_merkle_proof, _build_merkle_root

    commitments = ['a', 'b', 'c', 'd']
    merkle_root = _build_merkle_root(commitments)

    # For leaf 0 ('a'), sibling is leaf 1 ('b')
    leaf_a_hash = hashlib.sha256(b'a').digest()
    leaf_b_hash = hashlib.sha256(b'b').digest()
    parent_ab = hashlib.sha256(leaf_a_hash + leaf_b_hash).digest()

    leaf_c_hash = hashlib.sha256(b'c').digest()
    leaf_d_hash = hashlib.sha256(b'd').digest()
    parent_cd = hashlib.sha256(leaf_c_hash + leaf_d_hash).digest()

    # Proof for 'a' is [hash(b), hash(cd)]
    proof = [leaf_b_hash.hex(), parent_cd.hex()]

    result = _verify_merkle_proof('a', proof, 0, merkle_root)
    assert result is True


def test_verify_merkle_proof_invalid():
    """Test _verify_merkle_proof with invalid proof."""
    from app.lotto import _verify_merkle_proof, _build_merkle_root

    commitments = ['a', 'b', 'c', 'd']
    merkle_root = _build_merkle_root(commitments)

    # Wrong proof
    proof = ['0' * 64, '1' * 64]

    result = _verify_merkle_proof('a', proof, 0, merkle_root)
    assert result is False


def test_compute_anchor_hash():
    """Test _compute_anchor_hash produces correct hash."""
    from app.lotto import _compute_anchor_hash

    merkle_root = 'a' * 64
    entry_count = 10
    drand_round = 12345

    result = _compute_anchor_hash(merkle_root, entry_count, drand_round)

    expected_payload = f"{merkle_root}:{entry_count}:{drand_round}".encode('utf-8')
    expected = hashlib.sha256(expected_payload).hexdigest()

    assert result == expected


def test_compute_anchor_hash_deterministic():
    """Test _compute_anchor_hash is deterministic."""
    from app.lotto import _compute_anchor_hash

    result1 = _compute_anchor_hash('root', 5, 100)
    result2 = _compute_anchor_hash('root', 5, 100)

    assert result1 == result2


def test_compute_anchor_hash_different_inputs():
    """Test _compute_anchor_hash produces different hashes for different inputs."""
    from app.lotto import _compute_anchor_hash

    hash1 = _compute_anchor_hash('root1', 5, 100)
    hash2 = _compute_anchor_hash('root2', 5, 100)
    hash3 = _compute_anchor_hash('root1', 6, 100)
    hash4 = _compute_anchor_hash('root1', 5, 101)

    assert hash1 != hash2
    assert hash1 != hash3
    assert hash1 != hash4


def test_load_operator_keypair_missing_key():
    """Test _load_operator_keypair raises error when key not configured."""
    from app.lotto import _load_operator_keypair
    from fastapi import HTTPException

    with patch('app.lotto.settings') as mock_settings:
        mock_settings.lotto_operator_signing_key_b64 = ''

        with pytest.raises(HTTPException) as exc_info:
            _load_operator_keypair()

        assert exc_info.value.status_code == 503
        assert 'not configured' in exc_info.value.detail


def test_load_operator_keypair_invalid_base64():
    """Test _load_operator_keypair raises error for invalid base64."""
    from app.lotto import _load_operator_keypair
    from fastapi import HTTPException

    with patch('app.lotto.settings') as mock_settings:
        mock_settings.lotto_operator_signing_key_b64 = 'not-valid-base64!!!'

        with pytest.raises(HTTPException) as exc_info:
            _load_operator_keypair()

        assert exc_info.value.status_code == 500
        assert 'invalid base64' in exc_info.value.detail


def test_load_operator_keypair_wrong_length():
    """Test _load_operator_keypair raises error for wrong key length."""
    from app.lotto import _load_operator_keypair
    from fastapi import HTTPException

    with patch('app.lotto.settings') as mock_settings:
        # Valid base64 but wrong length (not 32 bytes)
        mock_settings.lotto_operator_signing_key_b64 = base64.b64encode(b'short').decode()

        with pytest.raises(HTTPException) as exc_info:
            _load_operator_keypair()

        assert exc_info.value.status_code == 500
        assert 'must be 32 bytes' in exc_info.value.detail


def test_load_operator_keypair_valid():
    """Test _load_operator_keypair with valid key."""
    from app.lotto import _load_operator_keypair

    # Generate valid 32-byte key
    test_key = b'a' * 32
    test_key_b64 = base64.b64encode(test_key).decode()

    with patch('app.lotto.settings') as mock_settings:
        mock_settings.lotto_operator_signing_key_b64 = test_key_b64

        pubkey_b64, private_key = _load_operator_keypair()

        assert isinstance(pubkey_b64, str)
        assert isinstance(private_key, object)  # Ed25519PrivateKey
        assert len(base64.b64decode(pubkey_b64)) == 32


def test_require_operator_missing_token():
    """Test _require_operator raises error when token not configured."""
    from app.lotto import _require_operator
    from fastapi import HTTPException

    with patch('app.lotto.settings') as mock_settings:
        mock_settings.lotto_operator_token = ''

        request = Mock()

        with pytest.raises(HTTPException) as exc_info:
            _require_operator(request)

        assert exc_info.value.status_code == 503
        assert 'not configured' in exc_info.value.detail


def test_require_operator_missing_header():
    """Test _require_operator raises error when header missing."""
    from app.lotto import _require_operator
    from fastapi import HTTPException

    with patch('app.lotto.settings') as mock_settings:
        mock_settings.lotto_operator_token = 'expected_token'

        request = Mock()
        request.headers.get = Mock(return_value='')

        with pytest.raises(HTTPException) as exc_info:
            _require_operator(request)

        assert exc_info.value.status_code == 403
        assert 'authorization failed' in exc_info.value.detail


def test_require_operator_wrong_token():
    """Test _require_operator raises error for wrong token."""
    from app.lotto import _require_operator
    from fastapi import HTTPException

    with patch('app.lotto.settings') as mock_settings:
        mock_settings.lotto_operator_token = 'expected_token'

        request = Mock()
        request.headers.get = Mock(return_value='wrong_token')

        with pytest.raises(HTTPException) as exc_info:
            _require_operator(request)

        assert exc_info.value.status_code == 403


def test_require_operator_valid_token():
    """Test _require_operator succeeds with valid token."""
    from app.lotto import _require_operator

    with patch('app.lotto.settings') as mock_settings:
        mock_settings.lotto_operator_token = 'correct_token'

        request = Mock()
        request.headers.get = Mock(return_value='correct_token')

        # Should not raise
        _require_operator(request)


@pytest.mark.asyncio
async def test_read_payload_json():
    """Test _read_payload with JSON content type."""
    from app.lotto import _read_payload

    request = Mock()
    request.headers.get = Mock(side_effect=lambda k, default='': 'application/json' if k == 'content-type' else default)
    request.json = AsyncMock(return_value={'key': 'value'})

    result = await _read_payload(request)

    assert result == {'key': 'value'}


@pytest.mark.asyncio
async def test_read_payload_form():
    """Test _read_payload with form content type."""
    from app.lotto import _read_payload

    request = Mock()
    request.headers.get = Mock(return_value='application/x-www-form-urlencoded')

    mock_form = {'field1': 'value1', 'field2': 'value2'}
    request.form = AsyncMock(return_value=mock_form)

    result = await _read_payload(request)

    assert result == mock_form


@pytest.mark.asyncio
async def test_read_payload_invalid_json():
    """Test _read_payload raises error for invalid JSON."""
    from app.lotto import _read_payload
    from fastapi import HTTPException

    request = Mock()
    request.headers.get = Mock(side_effect=lambda k, default='': 'application/json' if k == 'content-type' else default)
    request.json = AsyncMock(side_effect=json.JSONDecodeError('error', '', 0))

    with pytest.raises(HTTPException) as exc_info:
        await _read_payload(request)

    assert exc_info.value.status_code == 400
    assert 'Invalid JSON' in exc_info.value.detail


@pytest.mark.asyncio
async def test_read_payload_json_not_object():
    """Test _read_payload raises error when JSON is not an object."""
    from app.lotto import _read_payload
    from fastapi import HTTPException

    request = Mock()
    request.headers.get = Mock(side_effect=lambda k, default='': 'application/json' if k == 'content-type' else default)
    request.json = AsyncMock(return_value=['array', 'not', 'object'])

    with pytest.raises(HTTPException) as exc_info:
        await _read_payload(request)

    assert exc_info.value.status_code == 400
    assert 'must be an object' in exc_info.value.detail


def test_sign_anchor():
    """Test _sign_anchor produces signature."""
    from app.lotto import _sign_anchor

    test_key = b'a' * 32
    test_key_b64 = base64.b64encode(test_key).decode()

    with patch('app.lotto.settings') as mock_settings:
        mock_settings.lotto_operator_signing_key_b64 = test_key_b64

        anchor_hash = '0' * 64
        pubkey_b64, signature_b64 = _sign_anchor(anchor_hash)

        assert isinstance(pubkey_b64, str)
        assert isinstance(signature_b64, str)
        assert len(base64.b64decode(pubkey_b64)) == 32
        assert len(base64.b64decode(signature_b64)) == 64  # Ed25519 signature


def test_fetch_drand_randomness_mocked():
    """Test _fetch_drand_randomness with mocked HTTP response."""
    from app.lotto import _fetch_drand_randomness

    mock_response_data = {
        'randomness': 'abc123def456',
        'round': 12345
    }

    with patch('app.lotto.settings') as mock_settings:
        mock_settings.lotto_drand_url_template = 'https://api.drand.sh/public/{round}'

        with patch('app.lotto.urllib.request.urlopen') as mock_urlopen:
            mock_response = Mock()
            mock_response.read = Mock(return_value=json.dumps(mock_response_data).encode('utf-8'))
            mock_response.__enter__ = Mock(return_value=mock_response)
            mock_response.__exit__ = Mock(return_value=False)
            mock_urlopen.return_value = mock_response

            result = _fetch_drand_randomness(12345)

            assert result == 'abc123def456'


def test_fetch_drand_randomness_network_error():
    """Test _fetch_drand_randomness raises error on network failure."""
    from app.lotto import _fetch_drand_randomness
    from fastapi import HTTPException

    with patch('app.lotto.settings') as mock_settings:
        mock_settings.lotto_drand_url_template = 'https://api.drand.sh/public/{round}'

        with patch('app.lotto.urllib.request.urlopen', side_effect=Exception('Network error')):
            with pytest.raises(HTTPException) as exc_info:
                _fetch_drand_randomness(12345)

            assert exc_info.value.status_code == 502
            assert 'Could not fetch drand beacon' in exc_info.value.detail


def test_fetch_drand_randomness_invalid_response():
    """Test _fetch_drand_randomness raises error for invalid response."""
    from app.lotto import _fetch_drand_randomness
    from fastapi import HTTPException

    with patch('app.lotto.settings') as mock_settings:
        mock_settings.lotto_drand_url_template = 'https://api.drand.sh/public/{round}'

        with patch('app.lotto.urllib.request.urlopen') as mock_urlopen:
            mock_response = Mock()
            mock_response.read = Mock(return_value=b'{}')  # Missing randomness field
            mock_response.__enter__ = Mock(return_value=mock_response)
            mock_response.__exit__ = Mock(return_value=False)
            mock_urlopen.return_value = mock_response

            with pytest.raises(HTTPException) as exc_info:
                _fetch_drand_randomness(12345)

            assert exc_info.value.status_code == 502
            assert 'missing randomness' in exc_info.value.detail