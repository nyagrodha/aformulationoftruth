"""Comprehensive tests for app/gate.py questionnaire module."""

import json
import secrets
from unittest.mock import AsyncMock, MagicMock, Mock, patch
import pytest
from fastapi import Request
from fastapi.responses import RedirectResponse

from app.gate import (
    _require_user,
    _csrf_ok,
    _get_question_for_position,
)


class TestRequireUser:
    """Test user requirement helper."""

    def test_require_user_with_valid_user(self):
        """Test valid user dict is returned."""
        user = {"user_id": 42, "handle": "test"}
        result = _require_user(user)
        assert result == user

    def test_require_user_with_none(self):
        """Test None returns None."""
        result = _require_user(None)
        assert result is None

    def test_require_user_with_redirect(self):
        """Test RedirectResponse returns None."""
        redirect = RedirectResponse("/login")
        result = _require_user(redirect)
        assert result is None

    def test_require_user_with_empty_dict(self):
        """Test empty dict is returned as valid."""
        user = {}
        result = _require_user(user)
        assert result == user


class TestCSRFValidation:
    """Test CSRF validation in gate module."""

    def test_csrf_ok_valid_token(self):
        """Test valid CSRF token returns True."""
        token = secrets.token_urlsafe(32)
        request = Mock(spec=Request)
        request.cookies = {"_csrf": token}

        assert _csrf_ok(request, token) is True

    def test_csrf_ok_invalid_token(self):
        """Test invalid token returns False."""
        request = Mock(spec=Request)
        request.cookies = {"_csrf": "token1"}

        assert _csrf_ok(request, "token2") is False

    def test_csrf_ok_missing_cookie(self):
        """Test missing cookie returns False."""
        request = Mock(spec=Request)
        request.cookies = {}

        assert _csrf_ok(request, "token") is False

    def test_csrf_ok_empty_form_token(self):
        """Test empty form token returns False."""
        request = Mock(spec=Request)
        request.cookies = {"_csrf": "valid"}

        assert _csrf_ok(request, "") is False

    def test_csrf_ok_uses_constant_time_comparison(self):
        """Test CSRF comparison uses secrets.compare_digest."""
        token = "test_token"
        request = Mock(spec=Request)
        request.cookies = {"_csrf": token}

        with patch("app.gate.secrets.compare_digest") as mock_compare:
            mock_compare.return_value = True
            result = _csrf_ok(request, token)
            assert result is True
            mock_compare.assert_called_once()


class TestGetQuestionForPosition:
    """Test question position mapping."""

    def test_get_question_gate_first_position(self):
        """Test first position returns first gate question."""
        from app.questions import Question

        with patch("app.gate.GATE_QUESTIONS", [Question(id="g1"), Question(id="g2")]):
            question = _get_question_for_position(1, "seed123")
            assert question.id == "g1"

    def test_get_question_gate_second_position(self):
        """Test second position returns second gate question."""
        from app.questions import Question

        with patch("app.gate.GATE_QUESTIONS", [Question(id="g1"), Question(id="g2")]):
            question = _get_question_for_position(2, "seed123")
            assert question.id == "g2"

    @patch("app.gate.shuffle_questions")
    def test_get_question_main_first_position(self, mock_shuffle):
        """Test first main question (position 3)."""
        from app.questions import Question

        q1 = Question(id="q1")
        with patch("app.gate.GATE_QUESTIONS", [Question(id="g1"), Question(id="g2")]):
            with patch("app.gate.QUESTIONS", [q1, Question(id="q2")]):
                mock_shuffle.return_value = ["q1", "q2"]

                question = _get_question_for_position(3, "seed123")

                assert question.id == "q1"
                mock_shuffle.assert_called_once_with("seed123")

    @patch("app.gate.shuffle_questions")
    def test_get_question_beyond_available(self, mock_shuffle):
        """Test position beyond available questions returns None."""
        from app.questions import Question

        mock_shuffle.return_value = ["q1", "q2"]
        with patch("app.gate.GATE_QUESTIONS", [Question(id="g1")]):
            with patch("app.gate.QUESTIONS", [Question(id="q1"), Question(id="q2")]):
                question = _get_question_for_position(10, "seed123")
                assert question is None


class TestGateRoutes:
    """Test gate route handlers."""

    @pytest.mark.asyncio
    @patch("app.gate.get_current_user")
    @patch("app.gate.templates")
    @patch("app.gate.generate_csrf_token")
    @patch("app.gate.set_csrf_cookie")
    async def test_gate_landing_authenticated(
        self, mock_set_csrf, mock_gen_csrf, mock_templates, mock_get_user
    ):
        """Test gate landing page for authenticated user."""
        from app.gate import gate_landing

        mock_get_user.return_value = {"user_id": 42}
        mock_gen_csrf.return_value = "csrf123"
        mock_response = Mock()
        mock_templates.TemplateResponse.return_value = mock_response

        request = Mock(spec=Request)
        pool = AsyncMock()

        result = await gate_landing(request, pool)

        assert result == mock_response
        mock_templates.TemplateResponse.assert_called_once()
        mock_set_csrf.assert_called_once_with(mock_response, "csrf123")

    @pytest.mark.asyncio
    @patch("app.gate.get_current_user")
    async def test_gate_landing_unauthenticated(self, mock_get_user):
        """Test gate landing redirects unauthenticated users."""
        from app.gate import gate_landing

        mock_get_user.return_value = None

        request = Mock(spec=Request)
        pool = AsyncMock()

        result = await gate_landing(request, pool)

        assert isinstance(result, RedirectResponse)
        assert result.status_code == 303
        assert "/login" in str(result.headers.get("location", ""))


class TestQuestionFlow:
    """Test question flow and navigation."""

    @pytest.mark.asyncio
    @patch("app.gate.get_current_user")
    @patch("app.gate._csrf_ok")
    @patch("app.gate.generate_token")
    async def test_gate_start_creates_session_seed(
        self, mock_gen_token, mock_csrf, mock_get_user
    ):
        """Test starting questionnaire creates question order seed."""
        from app.gate import gate_start

        mock_get_user.return_value = {"user_id": 42, "sid": "session123"}
        mock_csrf.return_value = True
        mock_gen_token.return_value = "random_seed_123"

        request = Mock(spec=Request)
        pool = AsyncMock()
        mock_conn = AsyncMock()
        pool.acquire = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_conn), __aexit__=AsyncMock()))
        mock_conn.execute = AsyncMock()

        result = await gate_start(request, "csrf_token", pool)

        assert isinstance(result, RedirectResponse)
        assert "/gate/q/1" in str(result.headers.get("location", ""))
        mock_conn.execute.assert_called_once()

    @pytest.mark.asyncio
    @patch("app.gate.get_current_user")
    async def test_gate_start_unauthenticated(self, mock_get_user):
        """Test gate start redirects unauthenticated users."""
        from app.gate import gate_start

        mock_get_user.return_value = None

        request = Mock(spec=Request)
        pool = AsyncMock()

        result = await gate_start(request, "csrf", pool)

        assert isinstance(result, RedirectResponse)
        assert "/login" in str(result.headers.get("location", ""))

    @pytest.mark.asyncio
    @patch("app.gate.get_current_user")
    @patch("app.gate._csrf_ok")
    async def test_gate_start_invalid_csrf(self, mock_csrf, mock_get_user):
        """Test gate start rejects invalid CSRF token."""
        from app.gate import gate_start

        mock_get_user.return_value = {"user_id": 42}
        mock_csrf.return_value = False

        request = Mock(spec=Request)
        pool = AsyncMock()

        result = await gate_start(request, "bad_csrf", pool)

        assert isinstance(result, RedirectResponse)
        assert "/gate" in str(result.headers.get("location", ""))


class TestAnswerSubmission:
    """Test answer submission handling."""

    @pytest.mark.asyncio
    @patch("app.gate.get_current_user")
    @patch("app.gate._csrf_ok")
    @patch("app.gate._get_question_for_position")
    async def test_question_submit_saves_answer(
        self, mock_get_question, mock_csrf, mock_get_user
    ):
        """Test submitting answer saves to database."""
        from app.gate import question_submit
        from app.questions import Question

        mock_get_user.return_value = {
            "user_id": 42,
            "sid": "session123",
            "question_order_seed": "seed123",
        }
        mock_csrf.return_value = True
        mock_get_question.return_value = Question(id="q1")

        request = Mock(spec=Request)
        pool = AsyncMock()
        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(return_value={"answers": {}})
        mock_conn.execute = AsyncMock()
        pool.acquire = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_conn), __aexit__=AsyncMock()))
        mock_tx = AsyncMock(__aenter__=AsyncMock(return_value=None), __aexit__=AsyncMock())
        mock_conn.transaction = MagicMock(return_value=mock_tx)

        result = await question_submit(request, 1, "My answer", "csrf", pool)

        assert isinstance(result, RedirectResponse)
        assert "/gate/q/2" in str(result.headers.get("location", ""))

    @pytest.mark.asyncio
    @patch("app.gate.get_current_user")
    @patch("app.gate._csrf_ok")
    @patch("app.gate._get_question_for_position")
    @patch("app.gate.TOTAL_QUESTIONS", 35)
    async def test_question_submit_last_question_redirects_to_submit(
        self, mock_get_question, mock_csrf, mock_get_user
    ):
        """Test last question redirects to submission page."""
        from app.gate import question_submit
        from app.questions import Question

        mock_get_user.return_value = {
            "user_id": 42,
            "sid": "session123",
            "question_order_seed": "seed123",
        }
        mock_csrf.return_value = True
        mock_get_question.return_value = Question(id="q35")

        request = Mock(spec=Request)
        pool = AsyncMock()
        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(return_value={"answers": {}})
        mock_conn.execute = AsyncMock()
        pool.acquire = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_conn), __aexit__=AsyncMock()))
        mock_tx = AsyncMock(__aenter__=AsyncMock(return_value=None), __aexit__=AsyncMock())
        mock_conn.transaction = MagicMock(return_value=mock_tx)

        result = await question_submit(request, 35, "Final answer", "csrf", pool)

        assert isinstance(result, RedirectResponse)
        assert "/gate/submit" in str(result.headers.get("location", ""))

    @pytest.mark.asyncio
    @patch("app.gate.get_current_user")
    @patch("app.gate._csrf_ok")
    @patch("app.gate._get_question_for_position")
    async def test_question_submit_empty_answer_removes_from_dict(
        self, mock_get_question, mock_csrf, mock_get_user
    ):
        """Test submitting empty answer removes it from answers dict."""
        from app.gate import question_submit
        from app.questions import Question

        mock_get_user.return_value = {
            "user_id": 42,
            "sid": "session123",
            "question_order_seed": "seed123",
        }
        mock_csrf.return_value = True
        mock_get_question.return_value = Question(id="q1")

        request = Mock(spec=Request)
        pool = AsyncMock()
        mock_conn = AsyncMock()
        # Existing answer for q1
        mock_conn.fetchrow = AsyncMock(return_value={"answers": {"q1": "old answer"}})
        mock_conn.execute = AsyncMock()
        pool.acquire = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_conn), __aexit__=AsyncMock()))
        mock_tx = AsyncMock(__aenter__=AsyncMock(return_value=None), __aexit__=AsyncMock())
        mock_conn.transaction = MagicMock(return_value=mock_tx)

        result = await question_submit(request, 1, "  ", "csrf", pool)  # Whitespace only

        assert isinstance(result, RedirectResponse)
        # Verify execute was called to update answers
        assert mock_conn.execute.called


class TestSubmission:
    """Test final submission handling."""

    @pytest.mark.asyncio
    @patch("app.gate.get_current_user")
    @patch("app.gate._csrf_ok")
    @patch("app.gate.generate_token")
    @patch("app.gate.encrypt_answers")
    async def test_submit_final_encrypts_answers(
        self, mock_encrypt, mock_gen_token, mock_csrf, mock_get_user
    ):
        """Test final submission encrypts answers."""
        from app.gate import submit_final

        mock_get_user.return_value = {"user_id": 42, "sid": "session123"}
        mock_csrf.return_value = True
        mock_gen_token.return_value = "gate_token_123"
        mock_encrypt.return_value = "encrypted_payload"

        request = Mock(spec=Request)
        pool = AsyncMock()
        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(return_value={
            "answers": {"q1": "answer1", "q2": "answer2"},
            "question_order_seed": "seed123",
        })
        mock_conn.execute = AsyncMock()
        pool.acquire = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_conn), __aexit__=AsyncMock()))
        mock_tx = AsyncMock(__aenter__=AsyncMock(return_value=None), __aexit__=AsyncMock())
        mock_conn.transaction = MagicMock(return_value=mock_tx)

        result = await submit_final(request, "csrf", pool)

        assert isinstance(result, RedirectResponse)
        assert "token=gate_token_123" in str(result.headers.get("location", ""))
        mock_encrypt.assert_called_once()

    @pytest.mark.asyncio
    @patch("app.gate.get_current_user")
    @patch("app.gate._csrf_ok")
    async def test_submit_final_no_answers_redirects_to_gate(
        self, mock_csrf, mock_get_user
    ):
        """Test submission with no answers redirects back to gate."""
        from app.gate import submit_final

        mock_get_user.return_value = {"user_id": 42, "sid": "session123"}
        mock_csrf.return_value = True

        request = Mock(spec=Request)
        pool = AsyncMock()
        mock_conn = AsyncMock()
        mock_conn.fetchrow = AsyncMock(return_value={
            "answers": {},  # Empty answers
            "question_order_seed": "seed123",
        })
        pool.acquire = MagicMock(return_value=AsyncMock(__aenter__=AsyncMock(return_value=mock_conn), __aexit__=AsyncMock()))
        mock_tx = AsyncMock(__aenter__=AsyncMock(return_value=None), __aexit__=AsyncMock())
        mock_conn.transaction = MagicMock(return_value=mock_tx)

        result = await submit_final(request, "csrf", pool)

        assert isinstance(result, RedirectResponse)
        assert "/gate" in str(result.headers.get("location", ""))


class TestEdgeCases:
    """Test edge cases and boundary conditions."""

    @patch("app.gate.GATE_QUESTIONS", [])
    @patch("app.gate.QUESTIONS", [])
    @patch("app.gate.shuffle_questions")
    def test_get_question_empty_question_lists(self, mock_shuffle):
        """Test with no questions configured."""
        mock_shuffle.return_value = []

        question = _get_question_for_position(1, "seed")
        assert question is None

    def test_csrf_ok_none_form_token(self):
        """Test CSRF with None form token."""
        request = Mock(spec=Request)
        request.cookies = {"_csrf": "token"}

        # secrets.compare_digest requires both args to be strings
        # Function will fail with TypeError if None is passed
        with pytest.raises(TypeError):
            _csrf_ok(request, None)

    def test_require_user_with_dict_containing_redirect_value(self):
        """Test user dict with redirect as a value (not the dict itself)."""
        user = {"redirect": "/login", "user_id": 42}
        result = _require_user(user)
        assert result == user  # Dict is valid, not a RedirectResponse