"""Tests for app/lotto.py - Lotto protocol implementation."""

import pytest
import json
import hashlib
import base64
from unittest.mock import AsyncMock, MagicMock, patch, Mock
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException


# Mock dependencies before importing lotto module
@pytest.fixture(autouse=True)
def mock_dependencies():
    """Mock all external dependencies for lotto module."""
    with patch.dict('sys.modules', {
        'app.auth': MagicMock(),
        'app.config': MagicMock(),
        'app.db': MagicMock(),
    }):
        yield


def test_wants_json_returns_true_for_json_accept():
    """Test _wants_json returns True when Accept header contains JSON."""
    from app.lotto import _wants_json

    request = MagicMock()
    request.headers.get.side_effect = lambda key, default: {
        'accept': 'application/json',
        'content-type': ''
    }.get(key.lower(), default)

    assert _wants_json(request) is True


def test_wants_json_returns_true_for_json_content_type():
    """Test _wants_json returns True when Content-Type is JSON."""
    from app.lotto import _wants_json

    request = MagicMock()
    request.headers.get.side_effect = lambda key, default: {
        'accept': '',
        'content-type': 'application/json'
    }.get(key.lower(), default)

    assert _wants_json(request) is True


def test_wants_json_returns_false_for_html():
    """Test _wants_json returns False for non-JSON requests."""
    from app.lotto import _wants_json

    request = MagicMock()
    request.headers.get.side_effect = lambda key, default: ''

    assert _wants_json(request) is False


def test_normalize_token_success():
    """Test _normalize_token strips and validates token."""
    from app.lotto import _normalize_token

    result = _normalize_token("  test_token_123  ", "token")
    assert result == "test_token_123"


def test_normalize_token_raises_on_empty():
    """Test _normalize_token raises HTTPException for empty token."""
    from app.lotto import _normalize_token

    with pytest.raises(HTTPException) as exc:
        _normalize_token("", "test_field")

    assert exc.value.status_code == 400
    assert "test_field is required" in exc.value.detail


def test_normalize_token_raises_on_too_long():
    """Test _normalize_token raises HTTPException for too long token."""
    from app.lotto import _normalize_token

    long_token = "x" * 300

    with pytest.raises(HTTPException) as exc:
        _normalize_token(long_token, "test_field", max_len=256)

    assert exc.value.status_code == 400
    assert "test_field is too long" in exc.value.detail


def test_normalize_hash_hex_success():
    """Test _normalize_hash_hex validates and normalizes hex strings."""
    from app.lotto import _normalize_hash_hex

    # 64 hex chars (32 bytes)
    valid_hash = "a" * 64
    result = _normalize_hash_hex(valid_hash, "hash")
    assert result == valid_hash
    assert len(result) == 64


def test_normalize_hash_hex_strips_0x_prefix():
    """Test _normalize_hash_hex strips 0x prefix."""
    from app.lotto import _normalize_hash_hex

    hash_with_prefix = "0x" + "a" * 64
    result = _normalize_hash_hex(hash_with_prefix, "hash")
    assert result == "a" * 64
    assert not result.startswith("0x")


def test_normalize_hash_hex_lowercases():
    """Test _normalize_hash_hex converts to lowercase."""
    from app.lotto import _normalize_hash_hex

    result = _normalize_hash_hex("ABCDEF" + "0" * 58, "hash")
    assert result == "abcdef" + "0" * 58


def test_normalize_hash_hex_raises_on_wrong_length():
    """Test _normalize_hash_hex raises for wrong length."""
    from app.lotto import _normalize_hash_hex

    with pytest.raises(HTTPException) as exc:
        _normalize_hash_hex("abc123", "hash")

    assert exc.value.status_code == 400
    assert "must be 32-byte hex" in exc.value.detail


def test_normalize_hash_hex_raises_on_non_hex():
    """Test _normalize_hash_hex raises for non-hex characters."""
    from app.lotto import _normalize_hash_hex

    invalid = "g" * 64  # 'g' is not a hex digit

    with pytest.raises(HTTPException) as exc:
        _normalize_hash_hex(invalid, "hash")

    assert exc.value.status_code == 400
    assert "must be hex" in exc.value.detail


def test_parse_int_success():
    """Test _parse_int converts string to int."""
    from app.lotto import _parse_int

    assert _parse_int("42", "field") == 42
    assert _parse_int(123, "field") == 123


def test_parse_int_raises_on_invalid():
    """Test _parse_int raises HTTPException for invalid input."""
    from app.lotto import _parse_int

    with pytest.raises(HTTPException) as exc:
        _parse_int("not_a_number", "field")

    assert exc.value.status_code == 400
    assert "must be an integer" in exc.value.detail


def test_hash_bytes():
    """Test _hash_bytes returns SHA256 hash."""
    from app.lotto import _hash_bytes

    data = b"test data"
    result = _hash_bytes(data)

    expected = hashlib.sha256(data).digest()
    assert result == expected
    assert len(result) == 32


def test_leaf_hash():
    """Test _leaf_hash hashes commitment as UTF-8."""
    from app.lotto import _leaf_hash

    commitment = "test_commitment_123"
    result = _leaf_hash(commitment)

    expected = hashlib.sha256(commitment.encode("utf-8")).digest()
    assert result == expected


def test_build_merkle_root_single_commitment():
    """Test _build_merkle_root with single commitment."""
    from app.lotto import _build_merkle_root

    commitments = ["commitment1"]
    result = _build_merkle_root(commitments)

    # Single commitment should be its leaf hash
    expected = hashlib.sha256(b"commitment1").hexdigest()
    assert result == expected


def test_build_merkle_root_two_commitments():
    """Test _build_merkle_root with two commitments."""
    from app.lotto import _build_merkle_root

    commitments = ["commitment1", "commitment2"]
    result = _build_merkle_root(commitments)

    # Calculate expected root
    leaf1 = hashlib.sha256(b"commitment1").digest()
    leaf2 = hashlib.sha256(b"commitment2").digest()
    expected_root = hashlib.sha256(leaf1 + leaf2).hexdigest()

    assert result == expected_root


def test_build_merkle_root_odd_number():
    """Test _build_merkle_root handles odd number of commitments."""
    from app.lotto import _build_merkle_root

    commitments = ["c1", "c2", "c3"]
    result = _build_merkle_root(commitments)

    # Should duplicate last leaf when odd
    assert isinstance(result, str)
    assert len(result) == 64  # hex string of 32 bytes


def test_build_merkle_root_raises_on_empty():
    """Test _build_merkle_root raises HTTPException for empty list."""
    from app.lotto import _build_merkle_root

    with pytest.raises(HTTPException) as exc:
        _build_merkle_root([])

    assert exc.value.status_code == 400
    assert "No commitments available" in exc.value.detail


def test_verify_merkle_proof_valid():
    """Test _verify_merkle_proof validates correct proof."""
    from app.lotto import _build_merkle_root, _verify_merkle_proof

    # Build a tree with 4 commitments
    commitments = ["c1", "c2", "c3", "c4"]
    root = _build_merkle_root(commitments)

    # For c1 at index 0, compute proof manually
    leaf1 = hashlib.sha256(b"c1").digest()
    leaf2 = hashlib.sha256(b"c2").digest()
    leaf3 = hashlib.sha256(b"c3").digest()
    leaf4 = hashlib.sha256(b"c4").digest()

    # Sibling at level 0 is c2
    sibling_0 = leaf2.hex()
    # Sibling at level 1 is hash(c3, c4)
    sibling_1 = hashlib.sha256(leaf3 + leaf4).hexdigest()

    proof_hashes = [sibling_0, sibling_1]

    result = _verify_merkle_proof("c1", proof_hashes, 0, root)
    assert result is True


def test_verify_merkle_proof_invalid():
    """Test _verify_merkle_proof rejects incorrect proof."""
    from app.lotto import _build_merkle_root, _verify_merkle_proof

    commitments = ["c1", "c2", "c3", "c4"]
    root = _build_merkle_root(commitments)

    # Wrong proof
    proof_hashes = ["0" * 64, "1" * 64]

    result = _verify_merkle_proof("c1", proof_hashes, 0, root)
    assert result is False


def test_compute_anchor_hash():
    """Test _compute_anchor_hash creates deterministic hash."""
    from app.lotto import _compute_anchor_hash

    root = "a" * 64
    entry_count = 100
    drand_round = 12345

    result = _compute_anchor_hash(root, entry_count, drand_round)

    # Verify it's a hex string
    assert len(result) == 64
    assert all(c in '0123456789abcdef' for c in result)

    # Verify deterministic
    result2 = _compute_anchor_hash(root, entry_count, drand_round)
    assert result == result2

    # Different inputs produce different hashes
    result3 = _compute_anchor_hash(root, entry_count + 1, drand_round)
    assert result != result3


def test_require_operator_success():
    """Test _require_operator succeeds with valid token."""
    from app.lotto import _require_operator

    request = MagicMock()
    request.headers.get.return_value = "valid_operator_token"

    with patch('app.lotto.settings') as mock_settings:
        mock_settings.lotto_operator_token = "valid_operator_token"

        # Should not raise
        _require_operator(request)


def test_require_operator_raises_on_missing_token():
    """Test _require_operator raises when token not configured."""
    from app.lotto import _require_operator

    request = MagicMock()

    with patch('app.lotto.settings') as mock_settings:
        mock_settings.lotto_operator_token = ""

        with pytest.raises(HTTPException) as exc:
            _require_operator(request)

        assert exc.value.status_code == 503
        assert "not configured" in exc.value.detail


def test_require_operator_raises_on_invalid_token():
    """Test _require_operator raises on token mismatch."""
    from app.lotto import _require_operator

    request = MagicMock()
    request.headers.get.return_value = "wrong_token"

    with patch('app.lotto.settings') as mock_settings:
        mock_settings.lotto_operator_token = "correct_token"

        with pytest.raises(HTTPException) as exc:
            _require_operator(request)

        assert exc.value.status_code == 403
        assert "authorization failed" in exc.value.detail


@pytest.mark.asyncio
async def test_read_payload_from_json():
    """Test _read_payload parses JSON body."""
    from app.lotto import _read_payload

    request = MagicMock()
    request.headers.get.return_value = "application/json"
    request.json = AsyncMock(return_value={"key": "value"})

    result = await _read_payload(request)
    assert result == {"key": "value"}


@pytest.mark.asyncio
async def test_read_payload_from_form():
    """Test _read_payload parses form data."""
    from app.lotto import _read_payload

    request = MagicMock()
    request.headers.get.return_value = ""
    request.form = AsyncMock(return_value={"field1": "value1", "field2": "value2"})

    result = await _read_payload(request)
    assert result == {"field1": "value1", "field2": "value2"}


@pytest.mark.asyncio
async def test_read_payload_raises_on_invalid_json():
    """Test _read_payload raises on invalid JSON."""
    from app.lotto import _read_payload
    import json

    request = MagicMock()
    request.headers.get.return_value = "application/json"
    request.json = AsyncMock(side_effect=json.JSONDecodeError("error", "", 0))

    with pytest.raises(HTTPException) as exc:
        await _read_payload(request)

    assert exc.value.status_code == 400
    assert "Invalid JSON" in exc.value.detail


@pytest.mark.asyncio
async def test_read_payload_raises_on_non_dict_json():
    """Test _read_payload raises when JSON is not an object."""
    from app.lotto import _read_payload

    request = MagicMock()
    request.headers.get.return_value = "application/json"
    request.json = AsyncMock(return_value=["not", "a", "dict"])

    with pytest.raises(HTTPException) as exc:
        await _read_payload(request)

    assert exc.value.status_code == 400
    assert "must be an object" in exc.value.detail




@pytest.mark.asyncio
async def test_lotto_close_requires_operator():
    """Test /lotto/close requires operator authentication."""
    from app.lotto import lotto_close

    mock_request = AsyncMock()
    mock_pool = AsyncMock()

    with patch('app.lotto._require_operator', side_effect=HTTPException(status_code=403, detail="Unauthorized")):
        with pytest.raises(HTTPException) as exc:
            await lotto_close(mock_request, mock_pool)

        assert exc.value.status_code == 403







def test_fetch_drand_randomness_success():
    """Test _fetch_drand_randomness retrieves beacon."""
    from app.lotto import _fetch_drand_randomness
    import urllib.request

    mock_response = MagicMock()
    mock_response.read.return_value = json.dumps({
        "randomness": "ABCDEF1234567890"
    }).encode('utf-8')
    mock_response.__enter__.return_value = mock_response
    mock_response.__exit__.return_value = None

    with patch('urllib.request.urlopen', return_value=mock_response), \
         patch('app.lotto.settings') as mock_settings:

        mock_settings.lotto_drand_url_template = "https://api.drand.sh/public/{round}"

        result = _fetch_drand_randomness(12345)
        assert result == "abcdef1234567890"  # lowercase


def test_fetch_drand_randomness_raises_on_error():
    """Test _fetch_drand_randomness raises on network error."""
    from app.lotto import _fetch_drand_randomness
    import urllib.request

    with patch('urllib.request.urlopen', side_effect=Exception("Network error")), \
         patch('app.lotto.settings') as mock_settings:

        mock_settings.lotto_drand_url_template = "https://api.drand.sh/public/{round}"

        with pytest.raises(HTTPException) as exc:
            _fetch_drand_randomness(12345)

        assert exc.value.status_code == 502


def test_fetch_drand_randomness_raises_on_missing_field():
    """Test _fetch_drand_randomness raises when randomness field missing."""
    from app.lotto import _fetch_drand_randomness
    import urllib.request

    mock_response = MagicMock()
    mock_response.read.return_value = json.dumps({
        "other_field": "value"
    }).encode('utf-8')
    mock_response.__enter__.return_value = mock_response
    mock_response.__exit__.return_value = None

    with patch('urllib.request.urlopen', return_value=mock_response), \
         patch('app.lotto.settings') as mock_settings:

        mock_settings.lotto_drand_url_template = "https://api.drand.sh/public/{round}"

        with pytest.raises(HTTPException) as exc:
            _fetch_drand_randomness(12345)

        assert exc.value.status_code == 502
        assert "missing randomness" in exc.value.detail