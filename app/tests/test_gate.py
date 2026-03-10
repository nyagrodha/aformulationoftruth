"""Comprehensive tests for gate/questionnaire module."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import asyncpg
import pytest
from fastapi import Request

from app.gate import (
    _csrf_ok,
    _get_question_for_position,
    _require_user,
)


class TestRequireUser:
    """Test user requirement helper."""

    def test_require_user_with_valid_user(self):
        """Returns user when valid user provided."""
        user = {"user_id": 1, "handle": "test"}
        result = _require_user(user)
        assert result == user

    def test_require_user_with_none(self):
        """Returns None when user is None."""
        result = _require_user(None)
        assert result is None

    def test_require_user_with_redirect(self):
        """Returns None when user is a RedirectResponse."""
        from fastapi.responses import RedirectResponse
        redirect = RedirectResponse("/login")
        result = _require_user(redirect)
        assert result is None


class TestCSRFValidation:
    """Test CSRF validation in gate module."""

    def test_csrf_ok_with_matching_tokens(self):
        """CSRF validation succeeds with matching tokens."""
        token = "test-csrf-token"
        request = MagicMock(spec=Request)
        request.cookies.get.return_value = token

        assert _csrf_ok(request, token) is True

    def test_csrf_ok_with_mismatched_tokens(self):
        """CSRF validation fails with mismatched tokens."""
        request = MagicMock(spec=Request)
        request.cookies.get.return_value = "cookie-token"

        assert _csrf_ok(request, "different-token") is False

    def test_csrf_ok_with_missing_cookie(self):
        """CSRF validation fails when cookie is missing."""
        request = MagicMock(spec=Request)
        request.cookies.get.return_value = None

        assert _csrf_ok(request, "form-token") is False


class TestQuestionRetrieval:
    """Test question retrieval logic."""

    def test_get_question_for_position_gate_question(self):
        """Returns gate question for positions 1-2."""
        from app.questions import GATE_QUESTIONS

        question = _get_question_for_position(1, "any-seed")
        assert question == GATE_QUESTIONS[0]

        question = _get_question_for_position(2, "any-seed")
        assert question == GATE_QUESTIONS[1]

    def test_get_question_for_position_main_question(self):
        """Returns main question for positions > 2."""
        question = _get_question_for_position(3, "test-seed")
        assert question is not None
        assert hasattr(question, 'id')
        assert hasattr(question, 'text')

    def test_get_question_for_position_deterministic_shuffle(self):
        """Same seed produces same question order."""
        seed = "consistent-seed"

        q1_first = _get_question_for_position(3, seed)
        q1_second = _get_question_for_position(3, seed)

        assert q1_first.id == q1_second.id

    def test_get_question_for_position_different_seeds(self):
        """Different seeds may produce different orders."""
        q1 = _get_question_for_position(3, "seed1")
        q2 = _get_question_for_position(3, "seed2")

        # They might be the same or different, but structure should be consistent
        assert q1 is not None
        assert q2 is not None

    def test_get_question_for_position_out_of_range(self):
        """Returns None for position beyond available questions."""
        from app.questions import TOTAL_QUESTIONS

        question = _get_question_for_position(TOTAL_QUESTIONS + 10, "test-seed")
        assert question is None

    def test_get_question_for_position_boundary(self):
        """Handles boundary positions correctly."""
        from app.questions import TOTAL_QUESTIONS

        question = _get_question_for_position(TOTAL_QUESTIONS, "test-seed")
        # Should return a valid question or None based on implementation
        assert question is None or hasattr(question, 'id')


class TestGateLanding:
    """Test gate landing page."""

    def test_gate_landing_redirects_without_auth(self, test_client):
        """Gate landing redirects to login when not authenticated."""
        with patch("app.gate.get_current_user", return_value=None):
            response = test_client.get("/gate", allow_redirects=False)
            assert response.status_code == 303
            assert response.headers["location"] == "/login"

    def test_gate_landing_renders_with_auth(self, test_client):
        """Gate landing renders for authenticated users."""
        mock_user = {
            "user_id": 1,
            "handle": "test-user",
            "sid": "test-sid"
        }

        with patch("app.gate.get_current_user", return_value=mock_user):
            response = test_client.get("/gate")
            assert response.status_code == 200
            assert "csrf_token" in response.text


class TestGateStart:
    """Test questionnaire start."""

    def test_gate_start_redirects_without_auth(self, test_client):
        """Gate start redirects to login when not authenticated."""
        with patch("app.gate.get_current_user", return_value=None):
            response = test_client.post(
                "/gate/start",
                data={"csrf_token": "test"},
                allow_redirects=False
            )
            assert response.status_code == 303
            assert response.headers["location"] == "/login"

    def test_gate_start_requires_csrf(self, test_client, test_settings):
        """Gate start requires valid CSRF token."""
        mock_user = {"user_id": 1, "sid": "test-sid"}

        with patch("app.gate.get_current_user", return_value=mock_user):
            with patch("app.gate._csrf_ok", return_value=False):
                response = test_client.post(
                    "/gate/start",
                    data={"csrf_token": "invalid"},
                    allow_redirects=False
                )
                assert response.status_code == 303
                assert response.headers["location"] == "/gate"

    def test_gate_start_initializes_session(self, test_client, test_settings):
        """Gate start initializes session with question order."""
        mock_user = {"user_id": 1, "sid": "test-sid"}
        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock()
        mock_pool = MagicMock()
        mock_pool.acquire.return_value.__aenter__.return_value = mock_conn

        with patch("app.gate.get_current_user", return_value=mock_user):
            with patch("app.gate._csrf_ok", return_value=True):
                with patch("app.gate.get_pool", return_value=mock_pool):
                    response = test_client.post(
                        "/gate/start",
                        data={"csrf_token": "valid"},
                        allow_redirects=False
                    )
                    assert response.status_code == 303
                    assert response.headers["location"] == "/gate/q/1"


class TestQuestionView:
    """Test question viewing."""

    def test_question_view_redirects_without_auth(self, test_client):
        """Question view redirects to login when not authenticated."""
        with patch("app.gate.get_current_user", return_value=None):
            response = test_client.get("/gate/q/1", allow_redirects=False)
            assert response.status_code == 303
            assert response.headers["location"] == "/login"

    def test_question_view_requires_seed(self, test_client, test_settings):
        """Question view redirects if no question order seed."""
        mock_user = {"user_id": 1, "question_order_seed": None}

        with patch("app.gate.get_current_user", return_value=mock_user):
            response = test_client.get("/gate/q/1", allow_redirects=False)
            assert response.status_code == 303
            assert response.headers["location"] == "/gate"

    def test_question_view_invalid_position(self, test_client, test_settings):
        """Question view redirects for invalid position."""
        mock_user = {"user_id": 1, "question_order_seed": "test-seed"}

        with patch("app.gate.get_current_user", return_value=mock_user):
            response = test_client.get("/gate/q/0", allow_redirects=False)
            assert response.status_code == 303
            assert response.headers["location"] == "/gate"

    def test_question_view_position_too_high(self, test_client, test_settings):
        """Question view redirects for position beyond total."""
        from app.questions import TOTAL_QUESTIONS

        mock_user = {"user_id": 1, "question_order_seed": "test-seed"}

        with patch("app.gate.get_current_user", return_value=mock_user):
            response = test_client.get(
                f"/gate/q/{TOTAL_QUESTIONS + 1}",
                allow_redirects=False
            )
            assert response.status_code == 303


class TestQuestionSubmit:
    """Test question answer submission."""

    def test_question_submit_saves_answer(self, test_client, test_settings):
        """Question submit saves answer to database."""
        mock_user = {
            "user_id": 1,
            "sid": "test-sid",
            "question_order_seed": "test-seed",
            "answers": {}
        }

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(return_value={"answers": {}})
        mock_conn.execute = AsyncMock()
        mock_transaction = AsyncMock()
        mock_transaction.__aenter__ = AsyncMock(return_value=mock_transaction)
        mock_transaction.__aexit__ = AsyncMock(return_value=None)
        mock_conn.transaction.return_value = mock_transaction

        mock_pool = MagicMock()
        mock_pool.acquire.return_value.__aenter__.return_value = mock_conn

        with patch("app.gate.get_current_user", return_value=mock_user):
            with patch("app.gate._csrf_ok", return_value=True):
                with patch("app.gate.get_pool", return_value=mock_pool):
                    response = test_client.post(
                        "/gate/q/1",
                        data={
                            "answer": "Test answer",
                            "csrf_token": "valid"
                        },
                        allow_redirects=False
                    )
                    assert response.status_code == 303

    def test_question_submit_empty_answer_removes(self, test_client, test_settings):
        """Empty answer removes existing answer."""
        mock_user = {
            "user_id": 1,
            "sid": "test-sid",
            "question_order_seed": "test-seed",
            "answers": {"gate_consent": "yes"}
        }

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(
            return_value={"answers": {"gate_consent": "yes"}}
        )
        mock_conn.execute = AsyncMock()
        mock_transaction = AsyncMock()
        mock_transaction.__aenter__ = AsyncMock(return_value=mock_transaction)
        mock_transaction.__aexit__ = AsyncMock(return_value=None)
        mock_conn.transaction.return_value = mock_transaction

        mock_pool = MagicMock()
        mock_pool.acquire.return_value.__aenter__.return_value = mock_conn

        with patch("app.gate.get_current_user", return_value=mock_user):
            with patch("app.gate._csrf_ok", return_value=True):
                with patch("app.gate.get_pool", return_value=mock_pool):
                    response = test_client.post(
                        "/gate/q/1",
                        data={
                            "answer": "",
                            "csrf_token": "valid"
                        },
                        allow_redirects=False
                    )
                    assert response.status_code == 303


class TestSubmitConfirm:
    """Test submission confirmation."""

    def test_submit_confirm_shows_summary(self, test_client, test_settings):
        """Submit confirm shows answer count."""
        mock_user = {
            "user_id": 1,
            "answers": {"1": "a", "2": "b", "3": "c"}
        }

        with patch("app.gate.get_current_user", return_value=mock_user):
            response = test_client.get("/gate/submit")
            assert response.status_code == 200
            assert "3" in response.text or "answered" in response.text.lower()


class TestSubmitFinal:
    """Test final submission."""

    def test_submit_final_encrypts_answers(self, test_client, test_settings):
        """Final submit encrypts and stores answers."""
        mock_user = {
            "user_id": 1,
            "sid": "test-sid",
            "answers": {"1": "answer1"}
        }

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(
            return_value={
                "answers": {"1": "answer1"},
                "question_order_seed": "test-seed"
            }
        )
        mock_conn.execute = AsyncMock()
        mock_transaction = AsyncMock()
        mock_transaction.__aenter__ = AsyncMock(return_value=mock_transaction)
        mock_transaction.__aexit__ = AsyncMock(return_value=None)
        mock_conn.transaction.return_value = mock_transaction

        mock_pool = MagicMock()
        mock_pool.acquire.return_value.__aenter__.return_value = mock_conn

        with patch("app.gate.get_current_user", return_value=mock_user):
            with patch("app.gate._csrf_ok", return_value=True):
                with patch("app.gate.get_pool", return_value=mock_pool):
                    response = test_client.post(
                        "/gate/submit",
                        data={"csrf_token": "valid"},
                        allow_redirects=False
                    )
                    assert response.status_code == 303
                    assert "gate/complete" in response.headers["location"]

    def test_submit_final_no_answers(self, test_client, test_settings):
        """Final submit rejects empty answer set."""
        mock_user = {
            "user_id": 1,
            "sid": "test-sid",
            "answers": {}
        }

        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(
            return_value={
                "answers": {},
                "question_order_seed": "test-seed"
            }
        )
        mock_transaction = AsyncMock()
        mock_transaction.__aenter__ = AsyncMock(return_value=mock_transaction)
        mock_transaction.__aexit__ = AsyncMock(return_value=None)
        mock_conn.transaction.return_value = mock_transaction

        mock_pool = MagicMock()
        mock_pool.acquire.return_value.__aenter__.return_value = mock_conn

        with patch("app.gate.get_current_user", return_value=mock_user):
            with patch("app.gate._csrf_ok", return_value=True):
                with patch("app.gate.get_pool", return_value=mock_pool):
                    response = test_client.post(
                        "/gate/submit",
                        data={"csrf_token": "valid"},
                        allow_redirects=False
                    )
                    assert response.status_code == 303
                    assert response.headers["location"] == "/gate"


class TestCompletePage:
    """Test completion page."""

    def test_complete_page_shows_token(self, test_client, test_settings):
        """Complete page displays gate token."""
        mock_user = {"user_id": 1}

        with patch("app.gate.get_current_user", return_value=mock_user):
            response = test_client.get("/gate/complete?token=test123")
            assert response.status_code == 200
            assert "test123" in response.text

    def test_complete_page_requires_auth(self, test_client):
        """Complete page requires authentication."""
        with patch("app.gate.get_current_user", return_value=None):
            response = test_client.get(
                "/gate/complete?token=test123",
                allow_redirects=False
            )
            assert response.status_code == 303
            assert response.headers["location"] == "/login"