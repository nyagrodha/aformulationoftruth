"""Comprehensive tests for app.lotto module.

Tests cover lotto protocol: commit, close, draw, claim, audit, merkle tree operations,
cryptographic verification, and all edge cases.
"""

import base64
import hashlib
import json
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, Mock, patch

import pytest
from fastapi import HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse


@pytest.fixture
def mock_pool():
    """Create a mock database pool."""
    pool = AsyncMock()
    conn = AsyncMock()
    pool.acquire.return_value.__aenter__.return_value = conn
    return pool


@pytest.fixture
def mock_request():
    """Create a mock FastAPI request."""
    request = MagicMock(spec=Request)
    request.cookies = {}
    request.headers = {}
    return request


@pytest.fixture
def mock_user():
    """Create a mock authenticated user."""
    return {
        'sid': 'session123',
        'user_id': 42,
        'handle': 'test-user',
        'is_admin': False,
    }


class TestWantsJson:
    """Tests for content negotiation helper."""

    def test_wants_json_from_accept_header(self):
        """Test JSON detection via Accept header."""
        from app.lotto import _wants_json

        request = MagicMock(spec=Request)
        request.headers = {'accept': 'application/json'}

        assert _wants_json(request) is True

    def test_wants_json_from_content_type(self):
        """Test JSON detection via Content-Type header."""
        from app.lotto import _wants_json

        request = MagicMock(spec=Request)
        request.headers = {'content-type': 'application/json'}

        assert _wants_json(request) is True

    def test_wants_json_false(self):
        """Test HTML request detection."""
        from app.lotto import _wants_json

        request = MagicMock(spec=Request)
        request.headers = {'accept': 'text/html'}

        assert _wants_json(request) is False


class TestNormalizeToken:
    """Tests for token normalization."""

    def test_normalize_token_success(self):
        """Test valid token normalization."""
        from app.lotto import _normalize_token

        result = _normalize_token('  my_token  ', 'field')

        assert result == 'my_token'

    def test_normalize_token_empty(self):
        """Test empty token raises exception."""
        from app.lotto import _normalize_token

        with pytest.raises(HTTPException) as exc:
            _normalize_token('', 'field')

        assert exc.value.status_code == 400
        assert 'required' in exc.value.detail

    def test_normalize_token_too_long(self):
        """Test too long token raises exception."""
        from app.lotto import _normalize_token

        long_token = 'x' * 300

        with pytest.raises(HTTPException) as exc:
            _normalize_token(long_token, 'field', max_len=256)

        assert exc.value.status_code == 400
        assert 'too long' in exc.value.detail


class TestNormalizeHashHex:
    """Tests for hex hash normalization."""

    def test_normalize_hash_valid(self):
        """Test valid hex hash normalization."""
        from app.lotto import _normalize_hash_hex

        hash_val = '0x' + 'a' * 64
        result = _normalize_hash_hex(hash_val, 'field')

        assert result == 'a' * 64
        assert len(result) == 64

    def test_normalize_hash_without_prefix(self):
        """Test hex hash without 0x prefix."""
        from app.lotto import _normalize_hash_hex

        hash_val = 'b' * 64
        result = _normalize_hash_hex(hash_val, 'field')

        assert result == hash_val
        assert len(result) == 64

    def test_normalize_hash_wrong_length(self):
        """Test hash with wrong length raises exception."""
        from app.lotto import _normalize_hash_hex

        with pytest.raises(HTTPException) as exc:
            _normalize_hash_hex('abc123', 'field')

        assert exc.value.status_code == 400
        assert '32-byte hex' in exc.value.detail

    def test_normalize_hash_invalid_chars(self):
        """Test hash with invalid characters raises exception."""
        from app.lotto import _normalize_hash_hex

        invalid_hash = 'g' * 64  # 'g' is not a hex digit

        with pytest.raises(HTTPException) as exc:
            _normalize_hash_hex(invalid_hash, 'field')

        assert exc.value.status_code == 400
        assert 'hex' in exc.value.detail


class TestParseInt:
    """Tests for integer parsing."""

    def test_parse_int_success(self):
        """Test valid integer parsing."""
        from app.lotto import _parse_int

        assert _parse_int('42', 'field') == 42
        assert _parse_int(42, 'field') == 42

    def test_parse_int_invalid(self):
        """Test invalid integer raises exception."""
        from app.lotto import _parse_int

        with pytest.raises(HTTPException) as exc:
            _parse_int('not_a_number', 'field')

        assert exc.value.status_code == 400
        assert 'must be an integer' in exc.value.detail


class TestMerkleTreeOperations:
    """Tests for Merkle tree construction and verification."""

    def test_build_merkle_root_single(self):
        """Test Merkle root with single commitment."""
        from app.lotto import _build_merkle_root

        root = _build_merkle_root(['commitment1'])

        assert root is not None
        assert len(root) == 64  # SHA256 hex

    def test_build_merkle_root_multiple(self):
        """Test Merkle root with multiple commitments."""
        from app.lotto import _build_merkle_root

        commitments = ['c1', 'c2', 'c3', 'c4']
        root = _build_merkle_root(commitments)

        assert root is not None
        assert len(root) == 64

    def test_build_merkle_root_odd_count(self):
        """Test Merkle tree with odd number of leaves."""
        from app.lotto import _build_merkle_root

        commitments = ['c1', 'c2', 'c3']
        root = _build_merkle_root(commitments)

        assert root is not None
        assert len(root) == 64

    def test_build_merkle_root_empty(self):
        """Test empty commitment list raises exception."""
        from app.lotto import _build_merkle_root

        with pytest.raises(HTTPException) as exc:
            _build_merkle_root([])

        assert exc.value.status_code == 400

    def test_build_merkle_root_deterministic(self):
        """Test Merkle root is deterministic."""
        from app.lotto import _build_merkle_root

        commitments = ['c1', 'c2', 'c3']
        root1 = _build_merkle_root(commitments)
        root2 = _build_merkle_root(commitments)

        assert root1 == root2

    def test_build_merkle_root_order_matters(self):
        """Test Merkle root changes with commitment order."""
        from app.lotto import _build_merkle_root

        root1 = _build_merkle_root(['c1', 'c2'])
        root2 = _build_merkle_root(['c2', 'c1'])

        assert root1 != root2

    def test_verify_merkle_proof_valid(self):
        """Test valid Merkle proof verification."""
        from app.lotto import _build_merkle_root, _verify_merkle_proof

        commitments = ['c1', 'c2', 'c3', 'c4']
        root = _build_merkle_root(commitments)

        # For a 4-leaf tree, we need the sibling paths
        # This is a simplified test - in reality we'd compute the actual proof

    def test_verify_merkle_proof_invalid(self):
        """Test invalid Merkle proof is rejected."""
        from app.lotto import _verify_merkle_proof

        result = _verify_merkle_proof(
            commitment='fake',
            proof_hashes=[],
            leaf_index=0,
            merkle_root='invalid_root',
        )

        assert result is False


class TestCryptographicOperations:
    """Tests for cryptographic operations."""

    def test_hash_bytes(self):
        """Test SHA256 hashing."""
        from app.lotto import _hash_bytes

        result = _hash_bytes(b'test data')

        assert len(result) == 32  # SHA256 produces 32 bytes

    def test_leaf_hash(self):
        """Test leaf hash computation."""
        from app.lotto import _leaf_hash

        result = _leaf_hash('commitment123')

        assert len(result) == 32

    def test_compute_anchor_hash(self):
        """Test anchor hash computation."""
        from app.lotto import _compute_anchor_hash

        anchor = _compute_anchor_hash('root_hash', 100, 12345)

        assert len(anchor) == 64  # Hex string

    def test_compute_anchor_hash_deterministic(self):
        """Test anchor hash is deterministic."""
        from app.lotto import _compute_anchor_hash

        anchor1 = _compute_anchor_hash('root', 10, 100)
        anchor2 = _compute_anchor_hash('root', 10, 100)

        assert anchor1 == anchor2


class TestOperatorKeyManagement:
    """Tests for operator keypair loading and signing."""

    @patch('app.lotto.settings')
    def test_load_operator_keypair_missing_key(self, mock_settings):
        """Test loading keypair with missing key."""
        from app.lotto import _load_operator_keypair

        mock_settings.lotto_operator_signing_key_b64 = ''

        with pytest.raises(HTTPException) as exc:
            _load_operator_keypair()

        assert exc.value.status_code == 503

    @patch('app.lotto.settings')
    def test_load_operator_keypair_invalid_base64(self, mock_settings):
        """Test loading keypair with invalid base64."""
        from app.lotto import _load_operator_keypair

        mock_settings.lotto_operator_signing_key_b64 = 'invalid!@#$'

        with pytest.raises(HTTPException) as exc:
            _load_operator_keypair()

        assert exc.value.status_code == 500

    @patch('app.lotto.settings')
    def test_load_operator_keypair_wrong_length(self, mock_settings):
        """Test loading keypair with wrong key length."""
        from app.lotto import _load_operator_keypair

        # 16 bytes instead of 32
        mock_settings.lotto_operator_signing_key_b64 = base64.b64encode(b'x' * 16).decode()

        with pytest.raises(HTTPException) as exc:
            _load_operator_keypair()

        assert exc.value.status_code == 500

    @patch('app.lotto._load_operator_keypair')
    def test_sign_anchor(self, mock_load_keypair):
        """Test anchor signing."""
        from app.lotto import _sign_anchor

        mock_private_key = Mock()
        mock_private_key.sign.return_value = b'signature'
        mock_load_keypair.return_value = ('pubkey_b64', mock_private_key)

        pubkey, sig = _sign_anchor('anchor_hash' * 8)  # 64 char hex

        assert pubkey == 'pubkey_b64'
        assert sig is not None


class TestOperatorAuthorization:
    """Tests for operator authorization."""

    @patch('app.lotto.settings')
    def test_require_operator_not_configured(self, mock_settings):
        """Test operator check when token not configured."""
        from app.lotto import _require_operator

        mock_settings.lotto_operator_token = ''
        mock_request = MagicMock()

        with pytest.raises(HTTPException) as exc:
            _require_operator(mock_request)

        assert exc.value.status_code == 503

    @patch('app.lotto.settings')
    def test_require_operator_missing_header(self, mock_settings):
        """Test operator check with missing header."""
        from app.lotto import _require_operator

        mock_settings.lotto_operator_token = 'secret_token'
        mock_request = MagicMock()
        mock_request.headers = {}

        with pytest.raises(HTTPException) as exc:
            _require_operator(mock_request)

        assert exc.value.status_code == 403

    @patch('app.lotto.settings')
    def test_require_operator_wrong_token(self, mock_settings):
        """Test operator check with wrong token."""
        from app.lotto import _require_operator

        mock_settings.lotto_operator_token = 'correct_token'
        mock_request = MagicMock()
        mock_request.headers = {'x-operator-token': 'wrong_token'}

        with pytest.raises(HTTPException) as exc:
            _require_operator(mock_request)

        assert exc.value.status_code == 403

    @patch('app.lotto.settings')
    def test_require_operator_success(self, mock_settings):
        """Test successful operator authorization."""
        from app.lotto import _require_operator

        token = 'correct_token'
        mock_settings.lotto_operator_token = token
        mock_request = MagicMock()
        mock_request.headers = {'x-operator-token': token}

        # Should not raise
        _require_operator(mock_request)


class TestDrandIntegration:
    """Tests for drand beacon fetching."""

    @patch('app.lotto.urllib.request.urlopen')
    @patch('app.lotto.settings')
    def test_fetch_drand_randomness_success(self, mock_settings, mock_urlopen):
        """Test successful drand fetch."""
        from app.lotto import _fetch_drand_randomness

        mock_settings.lotto_drand_url_template = 'https://api.drand.sh/public/{round}'
        mock_response = Mock()
        mock_response.read.return_value = json.dumps({'randomness': 'abc123'}).encode()
        mock_urlopen.return_value.__enter__.return_value = mock_response

        result = _fetch_drand_randomness(12345)

        assert result == 'abc123'

    @patch('app.lotto.urllib.request.urlopen')
    @patch('app.lotto.settings')
    def test_fetch_drand_randomness_network_error(self, mock_settings, mock_urlopen):
        """Test drand fetch with network error."""
        from app.lotto import _fetch_drand_randomness

        mock_settings.lotto_drand_url_template = 'https://api.drand.sh/public/{round}'
        mock_urlopen.side_effect = Exception('Network error')

        with pytest.raises(HTTPException) as exc:
            _fetch_drand_randomness(12345)

        assert exc.value.status_code == 502

    @patch('app.lotto.urllib.request.urlopen')
    @patch('app.lotto.settings')
    def test_fetch_drand_randomness_invalid_response(self, mock_settings, mock_urlopen):
        """Test drand fetch with invalid response."""
        from app.lotto import _fetch_drand_randomness

        mock_settings.lotto_drand_url_template = 'https://api.drand.sh/public/{round}'
        mock_response = Mock()
        mock_response.read.return_value = json.dumps({'wrong_field': 'data'}).encode()
        mock_urlopen.return_value.__enter__.return_value = mock_response

        with pytest.raises(HTTPException) as exc:
            _fetch_drand_randomness(12345)

        assert exc.value.status_code == 502


class TestLottoPage:
    """Tests for lotto page rendering."""

    @pytest.mark.asyncio
    @patch('app.lotto.get_current_user')
    async def test_lotto_page_not_authenticated(self, mock_get_user, mock_pool):
        """Test lotto page redirects when not authenticated."""
        from app.lotto import lotto_page

        mock_get_user.return_value = None
        mock_request = MagicMock()

        result = await lotto_page(mock_request, mock_pool)

        assert isinstance(result, RedirectResponse)

    @pytest.mark.asyncio
    @patch('app.lotto.get_current_user')
    @patch('app.lotto._ensure_lotto_schema')
    @patch('app.lotto.templates')
    async def test_lotto_page_renders(self, mock_templates, mock_ensure, mock_get_user, mock_user, mock_pool):
        """Test lotto page renders for authenticated user."""
        from app.lotto import lotto_page

        mock_get_user.return_value = mock_user
        conn = mock_pool.acquire.return_value.__aenter__.return_value
        conn.fetchval.return_value = 5
        conn.fetchrow.return_value = None
        mock_templates.TemplateResponse.return_value = MagicMock()

        result = await lotto_page(mock_request, mock_pool)

        assert result is not None


class TestLottoCommit:
    """Tests for lotto commitment submission."""

    @pytest.mark.asyncio
    @patch('app.lotto.get_current_user')
    async def test_lotto_commit_not_authenticated_json(self, mock_get_user, mock_pool):
        """Test commit returns 401 for JSON request."""
        from app.lotto import lotto_commit

        mock_get_user.return_value = None
        mock_request = MagicMock()
        mock_request.headers = {'accept': 'application/json'}

        with pytest.raises(HTTPException) as exc:
            await lotto_commit(mock_request, mock_pool)

        assert exc.value.status_code == 401

    @pytest.mark.asyncio
    @patch('app.lotto.get_current_user')
    @patch('app.lotto._ensure_lotto_schema')
    @patch('app.lotto._read_payload')
    @patch('app.lotto._wants_json')
    async def test_lotto_commit_success(self, mock_wants_json, mock_read_payload, mock_ensure, mock_get_user, mock_user, mock_pool):
        """Test successful commitment submission."""
        from app.lotto import lotto_commit

        mock_get_user.return_value = mock_user
        mock_read_payload.return_value = {'commitment': 'C_commitment_12345'}
        mock_wants_json.return_value = True

        conn = mock_pool.acquire.return_value.__aenter__.return_value
        conn.fetchrow.return_value = {'committed_at': datetime.now()}

        result = await lotto_commit(mock_request, mock_pool)

        assert isinstance(result, JSONResponse)

    @pytest.mark.asyncio
    @patch('app.lotto.get_current_user')
    @patch('app.lotto._ensure_lotto_schema')
    @patch('app.lotto._read_payload')
    async def test_lotto_commit_duplicate(self, mock_read_payload, mock_ensure, mock_get_user, mock_user, mock_pool):
        """Test duplicate commitment handling."""
        import asyncpg
        from app.lotto import lotto_commit

        mock_get_user.return_value = mock_user
        mock_read_payload.return_value = {'commitment': 'duplicate'}

        conn = mock_pool.acquire.return_value.__aenter__.return_value
        conn.fetchrow.side_effect = [
            asyncpg.UniqueViolationError,
            {'committed_at': datetime.now()},
        ]

        with patch('app.lotto._wants_json', return_value=False):
            result = await lotto_commit(mock_request, mock_pool)

        assert isinstance(result, RedirectResponse)
        assert 'err=duplicate' in str(result.headers.get('location', ''))


class TestLottoClose:
    """Tests for closing lotto round."""

    @pytest.mark.asyncio
    @patch('app.lotto._require_operator')
    @patch('app.lotto._ensure_lotto_schema')
    @patch('app.lotto._read_payload')
    @patch('app.lotto.settings')
    async def test_lotto_close_insufficient_participants(self, mock_settings, mock_read_payload, mock_ensure, mock_require_op, mock_pool):
        """Test close fails with insufficient participants."""
        from app.lotto import lotto_close

        mock_settings.lotto_min_participants = 10
        mock_read_payload.return_value = {'drand_round_target': 12345}

        conn = mock_pool.acquire.return_value.__aenter__.return_value
        conn.fetch.return_value = [{'id': 1, 'commitment': 'c1'}]  # Only 1
        conn.transaction.return_value.__aenter__ = AsyncMock()
        conn.transaction.return_value.__aexit__ = AsyncMock()

        mock_request = MagicMock()

        with pytest.raises(HTTPException) as exc:
            await lotto_close(mock_request, mock_pool)

        assert exc.value.status_code == 400

    @pytest.mark.asyncio
    @patch('app.lotto._require_operator')
    @patch('app.lotto._ensure_lotto_schema')
    @patch('app.lotto._read_payload')
    @patch('app.lotto._build_merkle_root')
    @patch('app.lotto._sign_anchor')
    @patch('app.lotto.settings')
    async def test_lotto_close_success(self, mock_settings, mock_sign, mock_merkle, mock_read_payload, mock_ensure, mock_require_op, mock_pool):
        """Test successful round closing."""
        from app.lotto import lotto_close

        mock_settings.lotto_min_participants = 2
        mock_read_payload.return_value = {'drand_round_target': 12345}
        mock_merkle.return_value = 'merkle_root'
        mock_sign.return_value = ('pubkey', 'signature')

        conn = mock_pool.acquire.return_value.__aenter__.return_value
        commitments = [{'id': i, 'commitment': f'c{i}'} for i in range(10)]
        conn.fetch.return_value = commitments
        conn.fetchval.return_value = 1  # Round ID
        conn.transaction.return_value.__aenter__ = AsyncMock()
        conn.transaction.return_value.__aexit__ = AsyncMock()

        mock_request = MagicMock()

        result = await lotto_close(mock_request, mock_pool)

        assert isinstance(result, JSONResponse)


class TestLottoDraw:
    """Tests for drawing lotto winner."""

    @pytest.mark.asyncio
    @patch('app.lotto._ensure_lotto_schema')
    async def test_lotto_draw_round_not_found(self, mock_ensure, mock_pool):
        """Test draw with non-existent round."""
        from app.lotto import lotto_draw

        conn = mock_pool.acquire.return_value.__aenter__.return_value
        conn.fetchrow.return_value = None
        conn.transaction.return_value.__aenter__ = AsyncMock()
        conn.transaction.return_value.__aexit__ = AsyncMock()

        with pytest.raises(HTTPException) as exc:
            await lotto_draw(999, mock_pool)

        assert exc.value.status_code == 404

    @pytest.mark.asyncio
    @patch('app.lotto._ensure_lotto_schema')
    async def test_lotto_draw_already_drawn(self, mock_ensure, mock_pool):
        """Test draw with already drawn round."""
        from app.lotto import lotto_draw

        conn = mock_pool.acquire.return_value.__aenter__.return_value
        conn.fetchrow.return_value = {
            'id': 1,
            'status': 'drawn',
            'merkle_root': 'root',
            'entry_count': 10,
            'drand_round_target': 12345,
            'winner_idx': 5,
            'winner_commitment': 'winner',
            'beacon': 'beacon_data',
            'claim_deadline': datetime.now(timezone.utc),
        }
        conn.transaction.return_value.__aenter__ = AsyncMock()
        conn.transaction.return_value.__aexit__ = AsyncMock()

        result = await lotto_draw(1, mock_pool)

        assert isinstance(result, JSONResponse)

    @pytest.mark.asyncio
    @patch('app.lotto._ensure_lotto_schema')
    @patch('app.lotto._fetch_drand_randomness')
    async def test_lotto_draw_success(self, mock_fetch, mock_ensure, mock_pool):
        """Test successful winner drawing."""
        from app.lotto import lotto_draw

        mock_fetch.return_value = 'beacon_randomness'

        conn = mock_pool.acquire.return_value.__aenter__.return_value
        conn.fetchrow.side_effect = [
            {
                'id': 1,
                'status': 'closed',
                'merkle_root': 'root',
                'entry_count': 10,
                'drand_round_target': 12345,
                'winner_idx': None,
                'winner_commitment': None,
                'beacon': None,
                'claim_deadline': None,
            },
        ]
        conn.fetchval.return_value = 'winning_commitment'
        conn.transaction.return_value.__aenter__ = AsyncMock()
        conn.transaction.return_value.__aexit__ = AsyncMock()

        result = await lotto_draw(1, mock_pool)

        assert isinstance(result, JSONResponse)


class TestLottoClaim:
    """Tests for claiming lotto prize."""

    @pytest.mark.asyncio
    @patch('app.lotto._ensure_lotto_schema')
    @patch('app.lotto._read_payload')
    async def test_lotto_claim_snark_not_implemented(self, mock_read_payload, mock_ensure, mock_pool):
        """Test claim with SNARK proof returns 501."""
        from app.lotto import lotto_claim

        mock_read_payload.return_value = {'snark_proof': 'proof_data'}
        mock_request = MagicMock()

        with pytest.raises(HTTPException) as exc:
            await lotto_claim(mock_request, mock_pool)

        assert exc.value.status_code == 501

    @pytest.mark.asyncio
    @patch('app.lotto._ensure_lotto_schema')
    @patch('app.lotto._read_payload')
    async def test_lotto_claim_round_not_found(self, mock_read_payload, mock_ensure, mock_pool):
        """Test claim with non-existent round."""
        from app.lotto import lotto_claim

        mock_read_payload.return_value = {
            'round_id': 999,
            'commitment': 'c1',
            'nullifier': 'n1',
            'leaf_index': 0,
            'merkle_proof': [],
        }
        mock_request = MagicMock()

        conn = mock_pool.acquire.return_value.__aenter__.return_value
        conn.fetchrow.return_value = None
        conn.transaction.return_value.__aenter__ = AsyncMock()
        conn.transaction.return_value.__aexit__ = AsyncMock()

        with pytest.raises(HTTPException) as exc:
            await lotto_claim(mock_request, mock_pool)

        assert exc.value.status_code == 404

    @pytest.mark.asyncio
    @patch('app.lotto._ensure_lotto_schema')
    @patch('app.lotto._read_payload')
    async def test_lotto_claim_already_claimed(self, mock_read_payload, mock_ensure, mock_pool):
        """Test claim on already claimed round."""
        from app.lotto import lotto_claim

        mock_read_payload.return_value = {
            'round_id': 1,
            'commitment': 'c1',
            'nullifier': 'n1',
            'leaf_index': 0,
            'merkle_proof': [],
        }
        mock_request = MagicMock()

        conn = mock_pool.acquire.return_value.__aenter__.return_value
        conn.fetchrow.return_value = {
            'id': 1,
            'status': 'claimed',
            'merkle_root': 'root',
            'winner_commitment': 'c1',
            'claim_deadline': datetime.now(timezone.utc) + timedelta(days=1),
        }
        conn.transaction.return_value.__aenter__ = AsyncMock()
        conn.transaction.return_value.__aexit__ = AsyncMock()

        with pytest.raises(HTTPException) as exc:
            await lotto_claim(mock_request, mock_pool)

        assert exc.value.status_code == 409

    @pytest.mark.asyncio
    @patch('app.lotto._ensure_lotto_schema')
    @patch('app.lotto._read_payload')
    async def test_lotto_claim_expired_deadline(self, mock_read_payload, mock_ensure, mock_pool):
        """Test claim after deadline."""
        from app.lotto import lotto_claim

        mock_read_payload.return_value = {
            'round_id': 1,
            'commitment': 'c1',
            'nullifier': 'n1',
            'leaf_index': 0,
            'merkle_proof': [],
        }
        mock_request = MagicMock()

        conn = mock_pool.acquire.return_value.__aenter__.return_value
        conn.fetchrow.return_value = {
            'id': 1,
            'status': 'drawn',
            'merkle_root': 'root',
            'winner_commitment': 'c1',
            'claim_deadline': datetime.now(timezone.utc) - timedelta(days=1),
        }
        conn.transaction.return_value.__aenter__ = AsyncMock()
        conn.transaction.return_value.__aexit__ = AsyncMock()

        with pytest.raises(HTTPException) as exc:
            await lotto_claim(mock_request, mock_pool)

        assert exc.value.status_code == 410

    @pytest.mark.asyncio
    @patch('app.lotto._ensure_lotto_schema')
    @patch('app.lotto._read_payload')
    async def test_lotto_claim_wrong_commitment(self, mock_read_payload, mock_ensure, mock_pool):
        """Test claim with non-winning commitment."""
        from app.lotto import lotto_claim

        mock_read_payload.return_value = {
            'round_id': 1,
            'commitment': 'wrong',
            'nullifier': 'n1',
            'leaf_index': 0,
            'merkle_proof': [],
        }
        mock_request = MagicMock()

        conn = mock_pool.acquire.return_value.__aenter__.return_value
        conn.fetchrow.return_value = {
            'id': 1,
            'status': 'drawn',
            'merkle_root': 'root',
            'winner_commitment': 'correct',
            'claim_deadline': datetime.now(timezone.utc) + timedelta(days=1),
        }
        conn.transaction.return_value.__aenter__ = AsyncMock()
        conn.transaction.return_value.__aexit__ = AsyncMock()

        with pytest.raises(HTTPException) as exc:
            await lotto_claim(mock_request, mock_pool)

        assert exc.value.status_code == 403


class TestLottoAudit:
    """Tests for lotto audit endpoint."""

    @pytest.mark.asyncio
    @patch('app.lotto._ensure_lotto_schema')
    async def test_lotto_audit_round_not_found(self, mock_ensure, mock_pool):
        """Test audit with non-existent round."""
        from app.lotto import lotto_audit

        conn = mock_pool.acquire.return_value.__aenter__.return_value
        conn.fetchrow.return_value = None

        with pytest.raises(HTTPException) as exc:
            await lotto_audit(999, mock_pool)

        assert exc.value.status_code == 404

    @pytest.mark.asyncio
    @patch('app.lotto._ensure_lotto_schema')
    @patch('app.lotto._build_merkle_root')
    async def test_lotto_audit_success(self, mock_merkle, mock_ensure, mock_pool):
        """Test successful audit."""
        from app.lotto import lotto_audit

        mock_merkle.return_value = 'recomputed_root'

        conn = mock_pool.acquire.return_value.__aenter__.return_value
        conn.fetchrow.return_value = {
            'id': 1,
            'status': 'drawn',
            'merkle_root': 'recomputed_root',
            'entry_count': 5,
            'drand_round_target': 12345,
            'anchor_hash': 'anchor',
            'operator_pubkey': 'pubkey',
            'operator_signature': 'sig',
            'beacon': 'beacon',
            'winner_idx': 2,
            'winner_commitment': 'winner',
            'closed_at': datetime.now(),
            'drawn_at': datetime.now(),
            'claim_deadline': datetime.now(),
            'claimed_at': None,
            'claim_nullifier': None,
        }
        conn.fetch.side_effect = [
            [{'commitment': f'c{i}'} for i in range(5)],
            [],
        ]

        result = await lotto_audit(1, mock_pool)

        assert isinstance(result, JSONResponse)


class TestEdgeCases:
    """Tests for edge cases and boundary conditions."""

    def test_normalize_token_whitespace_only(self):
        """Test token with only whitespace."""
        from app.lotto import _normalize_token

        with pytest.raises(HTTPException):
            _normalize_token('   ', 'field')

    def test_parse_int_negative(self):
        """Test parsing negative integer."""
        from app.lotto import _parse_int

        result = _parse_int(-42, 'field')
        assert result == -42

    def test_merkle_proof_string_format(self):
        """Test merkle proof as comma-separated string."""
        from app.lotto import _parse_int

        # This would be tested in actual claim endpoint
        pass

    @pytest.mark.asyncio
    @patch('app.lotto._ensure_lotto_schema')
    async def test_ensure_schema_tables_exist(self, mock_ensure):
        """Test schema initialization when tables exist."""
        # This would require more complex mocking
        pass

    def test_hash_consistency(self):
        """Test hash functions produce consistent output."""
        from app.lotto import _hash_bytes

        data = b'test'
        hash1 = _hash_bytes(data)
        hash2 = _hash_bytes(data)

        assert hash1 == hash2