"""Comprehensive tests for app/lotto.py lottery protocol."""

import base64
import hashlib
import json
import secrets
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch, Mock
import pytest
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

from app.lotto import (
    _wants_json,
    _normalize_token,
    _normalize_hash_hex,
    _parse_int,
    _hash_bytes,
    _leaf_hash,
    _build_merkle_root,
    _verify_merkle_proof,
    _load_operator_keypair,
    _require_operator,
    _compute_anchor_hash,
    _sign_anchor,
    _fetch_drand_randomness,
    _read_payload,
)


class TestWantsJson:
    """Test JSON request detection."""

    def test_wants_json_accept_header(self):
        """Test detection via Accept header."""
        request = Mock(spec=Request)
        request.headers = {"accept": "application/json"}
        assert _wants_json(request) is True

    def test_wants_json_content_type_header(self):
        """Test detection via Content-Type header."""
        request = Mock(spec=Request)
        request.headers = {"content-type": "application/json"}
        assert _wants_json(request) is True

    def test_wants_json_both_headers(self):
        """Test detection with both headers."""
        request = Mock(spec=Request)
        request.headers = {"accept": "application/json", "content-type": "application/json"}
        assert _wants_json(request) is True

    def test_wants_json_html(self):
        """Test HTML request returns False."""
        request = Mock(spec=Request)
        request.headers = {"accept": "text/html"}
        assert _wants_json(request) is False

    def test_wants_json_no_headers(self):
        """Test no headers returns False."""
        request = Mock(spec=Request)
        request.headers = {}
        assert _wants_json(request) is False


class TestNormalizeToken:
    """Test token normalization."""

    def test_normalize_token_valid(self):
        """Test valid token normalization."""
        assert _normalize_token("  test123  ", "field") == "test123"

    def test_normalize_token_empty(self):
        """Test empty token raises error."""
        with pytest.raises(HTTPException) as exc_info:
            _normalize_token("", "field")
        assert exc_info.value.status_code == 400
        assert "field is required" in exc_info.value.detail

    def test_normalize_token_whitespace_only(self):
        """Test whitespace-only token raises error."""
        with pytest.raises(HTTPException) as exc_info:
            _normalize_token("   ", "field")
        assert exc_info.value.status_code == 400

    def test_normalize_token_too_long(self):
        """Test token exceeding max length raises error."""
        long_token = "a" * 257
        with pytest.raises(HTTPException) as exc_info:
            _normalize_token(long_token, "field", max_len=256)
        assert exc_info.value.status_code == 400
        assert "too long" in exc_info.value.detail

    def test_normalize_token_at_max_length(self):
        """Test token at exactly max length is accepted."""
        token = "a" * 256
        result = _normalize_token(token, "field", max_len=256)
        assert result == token

    def test_normalize_token_strips_whitespace(self):
        """Test that leading/trailing whitespace is removed."""
        assert _normalize_token("\n\ttoken\r\n", "field") == "token"


class TestNormalizeHashHex:
    """Test hex hash normalization."""

    def test_normalize_hash_hex_valid(self):
        """Test valid 64-character hex string."""
        hash_val = "a" * 64
        assert _normalize_hash_hex(hash_val, "field") == hash_val

    def test_normalize_hash_hex_with_0x_prefix(self):
        """Test hex with 0x prefix is stripped."""
        hash_val = "a" * 64
        assert _normalize_hash_hex(f"0x{hash_val}", "field") == hash_val

    def test_normalize_hash_hex_uppercase(self):
        """Test uppercase hex is lowercased."""
        assert _normalize_hash_hex("A" * 64, "field") == "a" * 64

    def test_normalize_hash_hex_wrong_length(self):
        """Test wrong length raises error."""
        with pytest.raises(HTTPException) as exc_info:
            _normalize_hash_hex("abc", "field")
        assert exc_info.value.status_code == 400
        assert "must be 32-byte hex" in exc_info.value.detail

    def test_normalize_hash_hex_invalid_chars(self):
        """Test non-hex characters raise error."""
        invalid = "g" * 64
        with pytest.raises(HTTPException) as exc_info:
            _normalize_hash_hex(invalid, "field")
        assert exc_info.value.status_code == 400
        assert "must be hex" in exc_info.value.detail

    def test_normalize_hash_hex_whitespace_stripped(self):
        """Test whitespace is stripped before validation."""
        hash_val = "b" * 64
        assert _normalize_hash_hex(f"  {hash_val}  ", "field") == hash_val


class TestParseInt:
    """Test integer parsing."""

    def test_parse_int_valid_string(self):
        """Test valid integer string."""
        assert _parse_int("42", "field") == 42

    def test_parse_int_valid_int(self):
        """Test valid integer."""
        assert _parse_int(42, "field") == 42

    def test_parse_int_negative(self):
        """Test negative integer."""
        assert _parse_int("-10", "field") == -10

    def test_parse_int_zero(self):
        """Test zero."""
        assert _parse_int("0", "field") == 0

    def test_parse_int_invalid(self):
        """Test invalid integer raises error."""
        with pytest.raises(HTTPException) as exc_info:
            _parse_int("not_an_int", "field")
        assert exc_info.value.status_code == 400
        assert "must be an integer" in exc_info.value.detail

    def test_parse_int_float_string(self):
        """Test float string raises error."""
        with pytest.raises(HTTPException):
            _parse_int("42.5", "field")


class TestHashFunctions:
    """Test cryptographic hash functions."""

    def test_hash_bytes_sha256(self):
        """Test SHA256 hashing."""
        data = b"test"
        result = _hash_bytes(data)
        expected = hashlib.sha256(data).digest()
        assert result == expected

    def test_hash_bytes_empty(self):
        """Test hashing empty bytes."""
        result = _hash_bytes(b"")
        expected = hashlib.sha256(b"").digest()
        assert result == expected

    def test_leaf_hash_returns_bytes(self):
        """Test leaf hash returns bytes."""
        result = _leaf_hash("commitment")
        assert isinstance(result, bytes)
        assert len(result) == 32  # SHA256 output

    def test_leaf_hash_deterministic(self):
        """Test leaf hash is deterministic."""
        commitment = "test_commitment"
        hash1 = _leaf_hash(commitment)
        hash2 = _leaf_hash(commitment)
        assert hash1 == hash2

    def test_leaf_hash_different_inputs(self):
        """Test different inputs produce different hashes."""
        hash1 = _leaf_hash("commitment1")
        hash2 = _leaf_hash("commitment2")
        assert hash1 != hash2


class TestMerkleTree:
    """Test Merkle tree operations."""

    def test_build_merkle_root_single_leaf(self):
        """Test Merkle root with single commitment."""
        root = _build_merkle_root(["commitment1"])
        assert isinstance(root, str)
        assert len(root) == 64  # Hex string of 32 bytes

    def test_build_merkle_root_two_leaves(self):
        """Test Merkle root with two commitments."""
        root = _build_merkle_root(["commitment1", "commitment2"])
        assert isinstance(root, str)
        assert len(root) == 64

    def test_build_merkle_root_odd_leaves(self):
        """Test Merkle root with odd number of leaves (duplicates last)."""
        root = _build_merkle_root(["c1", "c2", "c3"])
        assert isinstance(root, str)
        assert len(root) == 64

    def test_build_merkle_root_deterministic(self):
        """Test Merkle root is deterministic."""
        commitments = ["c1", "c2", "c3", "c4"]
        root1 = _build_merkle_root(commitments)
        root2 = _build_merkle_root(commitments)
        assert root1 == root2

    def test_build_merkle_root_order_matters(self):
        """Test that commitment order affects root."""
        root1 = _build_merkle_root(["c1", "c2"])
        root2 = _build_merkle_root(["c2", "c1"])
        assert root1 != root2

    def test_build_merkle_root_empty_raises(self):
        """Test empty commitment list raises error."""
        with pytest.raises(HTTPException) as exc_info:
            _build_merkle_root([])
        assert exc_info.value.status_code == 400
        assert "No commitments" in exc_info.value.detail

    def test_build_merkle_root_power_of_two(self):
        """Test Merkle root with power-of-two leaves."""
        commitments = [f"c{i}" for i in range(8)]
        root = _build_merkle_root(commitments)
        assert len(root) == 64

    def test_build_merkle_root_large_tree(self):
        """Test Merkle root with many leaves."""
        commitments = [f"commitment_{i}" for i in range(100)]
        root = _build_merkle_root(commitments)
        assert len(root) == 64


class TestMerkleProof:
    """Test Merkle proof verification."""

    def test_verify_merkle_proof_single_leaf(self):
        """Test verification with single leaf (no proof needed)."""
        commitment = "test"
        root = _build_merkle_root([commitment])
        # Single leaf has empty proof
        assert _verify_merkle_proof(commitment, [], 0, root) is True

    def test_verify_merkle_proof_two_leaves_left(self):
        """Test verification of left leaf in two-leaf tree."""
        c1, c2 = "commitment1", "commitment2"
        root = _build_merkle_root([c1, c2])

        # Proof for left leaf (index 0)
        sibling = _leaf_hash(c2).hex()
        assert _verify_merkle_proof(c1, [sibling], 0, root) is True

    def test_verify_merkle_proof_two_leaves_right(self):
        """Test verification of right leaf in two-leaf tree."""
        c1, c2 = "commitment1", "commitment2"
        root = _build_merkle_root([c1, c2])

        # Proof for right leaf (index 1)
        sibling = _leaf_hash(c1).hex()
        assert _verify_merkle_proof(c2, [sibling], 1, root) is True

    def test_verify_merkle_proof_invalid(self):
        """Test invalid proof returns False."""
        commitments = ["c1", "c2", "c3", "c4"]
        root = _build_merkle_root(commitments)

        # Wrong proof
        assert _verify_merkle_proof("c1", ["deadbeef" * 8], 0, root) is False

    def test_verify_merkle_proof_wrong_root(self):
        """Test proof with wrong root returns False."""
        commitment = "test"
        root = _build_merkle_root([commitment])
        wrong_root = "0" * 64

        assert _verify_merkle_proof(commitment, [], 0, wrong_root) is False

    def test_verify_merkle_proof_accepts_0x_prefix(self):
        """Test proof hashes can have 0x prefix."""
        c1, c2 = "c1", "c2"
        root = _build_merkle_root([c1, c2])
        sibling = "0x" + _leaf_hash(c2).hex()

        assert _verify_merkle_proof(c1, [sibling], 0, root) is True


class TestOperatorKeypair:
    """Test operator keypair loading and signing."""

    def test_load_operator_keypair_valid(self):
        """Test loading valid operator keypair."""
        # Generate a valid 32-byte key
        private_bytes = secrets.token_bytes(32)
        key_b64 = base64.b64encode(private_bytes).decode("ascii")

        with patch("app.lotto.settings") as mock_settings:
            mock_settings.lotto_operator_signing_key_b64 = key_b64
            pubkey, privkey = _load_operator_keypair()

            assert isinstance(pubkey, str)
            assert len(base64.b64decode(pubkey)) == 32  # Ed25519 public key is 32 bytes

    def test_load_operator_keypair_not_configured(self):
        """Test error when keypair is not configured."""
        with patch("app.lotto.settings") as mock_settings:
            mock_settings.lotto_operator_signing_key_b64 = ""

            with pytest.raises(HTTPException) as exc_info:
                _load_operator_keypair()
            assert exc_info.value.status_code == 503
            assert "not configured" in exc_info.value.detail

    def test_load_operator_keypair_invalid_base64(self):
        """Test error with invalid base64."""
        with patch("app.lotto.settings") as mock_settings:
            mock_settings.lotto_operator_signing_key_b64 = "invalid!@#$"

            with pytest.raises(HTTPException) as exc_info:
                _load_operator_keypair()
            assert exc_info.value.status_code == 500
            assert "invalid base64" in exc_info.value.detail

    def test_load_operator_keypair_wrong_length(self):
        """Test error when key is not 32 bytes."""
        wrong_length = base64.b64encode(b"short").decode("ascii")

        with patch("app.lotto.settings") as mock_settings:
            mock_settings.lotto_operator_signing_key_b64 = wrong_length

            with pytest.raises(HTTPException) as exc_info:
                _load_operator_keypair()
            assert exc_info.value.status_code == 500
            assert "must be 32 bytes" in exc_info.value.detail

    def test_sign_anchor_produces_signature(self):
        """Test signing produces valid signature."""
        private_bytes = secrets.token_bytes(32)
        key_b64 = base64.b64encode(private_bytes).decode("ascii")

        with patch("app.lotto.settings") as mock_settings:
            mock_settings.lotto_operator_signing_key_b64 = key_b64

            anchor_hash = "a" * 64
            pubkey, signature = _sign_anchor(anchor_hash)

            assert isinstance(pubkey, str)
            assert isinstance(signature, str)
            # Ed25519 signature is 64 bytes
            assert len(base64.b64decode(signature)) == 64


class TestRequireOperator:
    """Test operator authorization."""

    def test_require_operator_valid_token(self):
        """Test valid operator token passes."""
        token = "secret_operator_token"
        request = Mock(spec=Request)
        request.headers = {"x-operator-token": token}

        with patch("app.lotto.settings") as mock_settings:
            mock_settings.lotto_operator_token = token
            # Should not raise
            _require_operator(request)

    def test_require_operator_invalid_token(self):
        """Test invalid token raises 403."""
        request = Mock(spec=Request)
        request.headers = {"x-operator-token": "wrong_token"}

        with patch("app.lotto.settings") as mock_settings:
            mock_settings.lotto_operator_token = "correct_token"

            with pytest.raises(HTTPException) as exc_info:
                _require_operator(request)
            assert exc_info.value.status_code == 403
            assert "authorization failed" in exc_info.value.detail

    def test_require_operator_missing_token(self):
        """Test missing token raises 403."""
        request = Mock(spec=Request)
        request.headers = {}

        with patch("app.lotto.settings") as mock_settings:
            mock_settings.lotto_operator_token = "required_token"

            with pytest.raises(HTTPException) as exc_info:
                _require_operator(request)
            assert exc_info.value.status_code == 403

    def test_require_operator_not_configured(self):
        """Test error when operator token not configured."""
        request = Mock(spec=Request)
        request.headers = {"x-operator-token": "any_token"}

        with patch("app.lotto.settings") as mock_settings:
            mock_settings.lotto_operator_token = ""

            with pytest.raises(HTTPException) as exc_info:
                _require_operator(request)
            assert exc_info.value.status_code == 503
            assert "not configured" in exc_info.value.detail


class TestAnchorHash:
    """Test anchor hash computation."""

    def test_compute_anchor_hash_deterministic(self):
        """Test anchor hash is deterministic."""
        root = "abc123"
        count = 10
        round_target = 12345

        hash1 = _compute_anchor_hash(root, count, round_target)
        hash2 = _compute_anchor_hash(root, count, round_target)

        assert hash1 == hash2

    def test_compute_anchor_hash_format(self):
        """Test anchor hash format."""
        hash_val = _compute_anchor_hash("root", 5, 100)
        assert isinstance(hash_val, str)
        assert len(hash_val) == 64  # SHA256 hex
        assert all(c in "0123456789abcdef" for c in hash_val)

    def test_compute_anchor_hash_different_inputs(self):
        """Test different inputs produce different hashes."""
        hash1 = _compute_anchor_hash("root1", 10, 100)
        hash2 = _compute_anchor_hash("root2", 10, 100)
        hash3 = _compute_anchor_hash("root1", 11, 100)
        hash4 = _compute_anchor_hash("root1", 10, 101)

        assert len({hash1, hash2, hash3, hash4}) == 4  # All unique


class TestFetchDrandRandomness:
    """Test drand beacon fetching."""

    @patch("app.lotto.urllib.request.urlopen")
    @patch("app.lotto.settings")
    def test_fetch_drand_randomness_success(self, mock_settings, mock_urlopen):
        """Test successful drand fetch."""
        mock_settings.lotto_drand_url_template = "https://api.drand.sh/public/{round}"

        mock_response = Mock()
        mock_response.read.return_value = json.dumps({
            "randomness": "ABCD1234"
        }).encode()
        mock_urlopen.return_value.__enter__.return_value = mock_response

        result = _fetch_drand_randomness(12345)
        assert result == "abcd1234"  # Lowercased

    @patch("app.lotto.urllib.request.urlopen")
    @patch("app.lotto.settings")
    def test_fetch_drand_randomness_network_error(self, mock_settings, mock_urlopen):
        """Test network error raises 502."""
        mock_settings.lotto_drand_url_template = "https://api.drand.sh/public/{round}"
        mock_urlopen.side_effect = Exception("Network error")

        with pytest.raises(HTTPException) as exc_info:
            _fetch_drand_randomness(12345)
        assert exc_info.value.status_code == 502

    @patch("app.lotto.urllib.request.urlopen")
    @patch("app.lotto.settings")
    def test_fetch_drand_randomness_invalid_json(self, mock_settings, mock_urlopen):
        """Test invalid JSON raises 502."""
        mock_settings.lotto_drand_url_template = "https://api.drand.sh/public/{round}"

        mock_response = Mock()
        mock_response.read.return_value = b"not json"
        mock_urlopen.return_value.__enter__.return_value = mock_response

        with pytest.raises(HTTPException) as exc_info:
            _fetch_drand_randomness(12345)
        assert exc_info.value.status_code == 502

    @patch("app.lotto.urllib.request.urlopen")
    @patch("app.lotto.settings")
    def test_fetch_drand_randomness_missing_field(self, mock_settings, mock_urlopen):
        """Test missing randomness field raises 502."""
        mock_settings.lotto_drand_url_template = "https://api.drand.sh/public/{round}"

        mock_response = Mock()
        mock_response.read.return_value = json.dumps({"other": "data"}).encode()
        mock_urlopen.return_value.__enter__.return_value = mock_response

        with pytest.raises(HTTPException) as exc_info:
            _fetch_drand_randomness(12345)
        assert exc_info.value.status_code == 502
        assert "missing randomness" in exc_info.value.detail


class TestReadPayload:
    """Test request payload reading."""

    @pytest.mark.asyncio
    async def test_read_payload_json(self):
        """Test reading JSON payload."""
        request = Mock(spec=Request)
        request.headers = {"content-type": "application/json"}
        request.json = AsyncMock(return_value={"key": "value"})

        result = await _read_payload(request)
        assert result == {"key": "value"}

    @pytest.mark.asyncio
    async def test_read_payload_form(self):
        """Test reading form payload."""
        request = Mock(spec=Request)
        request.headers = {"content-type": "application/x-www-form-urlencoded"}

        async def mock_form():
            return {"field1": "value1", "field2": "value2"}

        request.form = mock_form
        result = await _read_payload(request)
        assert result == {"field1": "value1", "field2": "value2"}

    @pytest.mark.asyncio
    async def test_read_payload_invalid_json(self):
        """Test invalid JSON raises 400."""
        request = Mock(spec=Request)
        request.headers = {"content-type": "application/json"}
        request.json = AsyncMock(side_effect=json.JSONDecodeError("msg", "doc", 0))

        with pytest.raises(HTTPException) as exc_info:
            await _read_payload(request)
        assert exc_info.value.status_code == 400
        assert "Invalid JSON" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_read_payload_json_not_dict(self):
        """Test non-dict JSON raises 400."""
        request = Mock(spec=Request)
        request.headers = {"content-type": "application/json"}
        request.json = AsyncMock(return_value=["not", "a", "dict"])

        with pytest.raises(HTTPException) as exc_info:
            await _read_payload(request)
        assert exc_info.value.status_code == 400
        assert "must be an object" in exc_info.value.detail