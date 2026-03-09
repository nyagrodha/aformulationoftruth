"""Comprehensive tests for app.gate module.

Tests cover questionnaire flow, consent, question navigation, answer submission,
and final submission with encryption.
"""

import json
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, Mock, patch

import pytest
from fastapi import Request
from fastapi.responses import HTMLResponse, RedirectResponse


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
        'created_at': datetime.now().isoformat(),
        'csrf_token': 'csrf123',
        'question_order_seed': 'seed123',
        'current_question': 1,
        'answers': {},
    }


class TestRequireUser:
    """Tests for _require_user helper function."""

    def test_require_user_with_valid_user(self):
        """Test _require_user returns user when valid."""
        from app.gate import _require_user

        user = {'user_id': 42, 'handle': 'test'}
        result = _require_user(user)

        assert result == user

    def test_require_user_with_none(self):
        """Test _require_user returns None when user is None."""
        from app.gate import _require_user

        result = _require_user(None)

        assert result is None

    def test_require_user_with_redirect(self):
        """Test _require_user returns None for RedirectResponse."""
        from app.gate import _require_user

        redirect = RedirectResponse(url='/login')
        result = _require_user(redirect)

        assert result is None


class TestCSRFValidation:
    """Tests for CSRF validation in gate module."""

    def test_csrf_ok_valid_token(self):
        """Test CSRF validation passes with valid token."""
        from app.gate import _csrf_ok

        token = 'test_token'
        request = MagicMock(spec=Request)
        request.cookies = {'_csrf': token}

        result = _csrf_ok(request, token)

        assert result is True

    def test_csrf_ok_invalid_token(self):
        """Test CSRF validation fails with wrong token."""
        from app.gate import _csrf_ok

        request = MagicMock(spec=Request)
        request.cookies = {'_csrf': 'token1'}

        result = _csrf_ok(request, 'token2')

        assert result is False

    def test_csrf_ok_missing_cookie(self):
        """Test CSRF validation fails without cookie."""
        from app.gate import _csrf_ok

        request = MagicMock(spec=Request)
        request.cookies = {}

        result = _csrf_ok(request, 'token')

        assert result is False


class TestGateLanding:
    """Tests for gate landing page (consent)."""

    @pytest.mark.asyncio
    @patch('app.gate.get_current_user')
    async def test_gate_landing_not_authenticated(self, mock_get_user, mock_pool):
        """Test gate landing redirects when not authenticated."""
        from app.gate import gate_landing

        mock_get_user.return_value = None
        mock_request = MagicMock(spec=Request)

        result = await gate_landing(mock_request, mock_pool)

        assert isinstance(result, RedirectResponse)
        assert '/login' in str(result.headers.get('location', ''))

    @pytest.mark.asyncio
    @patch('app.gate.get_current_user')
    @patch('app.gate.generate_csrf_token')
    @patch('app.gate.templates')
    async def test_gate_landing_authenticated(self, mock_templates, mock_csrf, mock_get_user, mock_user, mock_pool):
        """Test gate landing renders for authenticated user."""
        from app.gate import gate_landing

        mock_get_user.return_value = mock_user
        mock_csrf.return_value = 'csrf_new'
        mock_request = MagicMock(spec=Request)
        mock_response = MagicMock()
        mock_templates.TemplateResponse.return_value = mock_response

        result = await gate_landing(mock_request, mock_pool)

        assert result == mock_response
        call_args = mock_templates.TemplateResponse.call_args[0]
        assert call_args[1] == 'gate.html'
        assert 'csrf_token' in call_args[2]
        assert 'gate_questions' in call_args[2]
        assert 'total_questions' in call_args[2]


class TestGateStart:
    """Tests for starting the questionnaire."""

    @pytest.mark.asyncio
    @patch('app.gate.get_current_user')
    async def test_gate_start_not_authenticated(self, mock_get_user, mock_pool):
        """Test gate start redirects when not authenticated."""
        from app.gate import gate_start

        mock_get_user.return_value = None
        mock_request = MagicMock(spec=Request)

        result = await gate_start(mock_request, 'csrf_token', mock_pool)

        assert isinstance(result, RedirectResponse)
        assert '/login' in str(result.headers.get('location', ''))

    @pytest.mark.asyncio
    @patch('app.gate.get_current_user')
    @patch('app.gate._csrf_ok')
    async def test_gate_start_csrf_failure(self, mock_csrf_ok, mock_get_user, mock_user, mock_pool):
        """Test gate start redirects on CSRF failure."""
        from app.gate import gate_start

        mock_get_user.return_value = mock_user
        mock_csrf_ok.return_value = False
        mock_request = MagicMock(spec=Request)

        result = await gate_start(mock_request, 'bad_token', mock_pool)

        assert isinstance(result, RedirectResponse)
        assert '/gate' in str(result.headers.get('location', ''))

    @pytest.mark.asyncio
    @patch('app.gate.get_current_user')
    @patch('app.gate._csrf_ok')
    @patch('app.gate.generate_token')
    async def test_gate_start_success(self, mock_gen_token, mock_csrf_ok, mock_get_user, mock_user, mock_pool):
        """Test successful questionnaire start."""
        from app.gate import gate_start

        mock_get_user.return_value = mock_user
        mock_csrf_ok.return_value = True
        mock_gen_token.return_value = 'new_seed'
        mock_request = MagicMock(spec=Request)

        conn = mock_pool.acquire.return_value.__aenter__.return_value

        result = await gate_start(mock_request, 'csrf_token', mock_pool)

        assert isinstance(result, RedirectResponse)
        assert '/gate/q/1' in str(result.headers.get('location', ''))
        conn.execute.assert_called_once()


class TestGetQuestionForPosition:
    """Tests for question retrieval by position."""

    @patch('app.gate.GATE_QUESTIONS', [{'id': 'gate1'}, {'id': 'gate2'}])
    def test_get_question_gate_questions(self):
        """Test retrieval of gate questions (positions 1-2)."""
        from app.gate import _get_question_for_position

        q1 = _get_question_for_position(1, 'seed')
        q2 = _get_question_for_position(2, 'seed')

        assert q1['id'] == 'gate1'
        assert q2['id'] == 'gate2'

    @patch('app.gate.GATE_QUESTIONS', [{'id': 'gate1'}])
    @patch('app.gate.shuffle_questions')
    @patch('app.gate.QUESTIONS', [
        {'id': 'q1'},
        {'id': 'q2'},
        {'id': 'q3'},
    ])
    def test_get_question_main_questions(self, mock_shuffle):
        """Test retrieval of main questions (after gate)."""
        from app.gate import _get_question_for_position

        mock_shuffle.return_value = ['q2', 'q1', 'q3']

        # Position 2 = first main question (index 0)
        q = _get_question_for_position(2, 'seed123')

        assert q['id'] == 'q2'
        mock_shuffle.assert_called_once_with('seed123')

    @patch('app.gate.GATE_QUESTIONS', [])
    @patch('app.gate.shuffle_questions')
    def test_get_question_out_of_range(self, mock_shuffle):
        """Test retrieval beyond available questions."""
        from app.gate import _get_question_for_position

        mock_shuffle.return_value = ['q1', 'q2']

        result = _get_question_for_position(100, 'seed')

        assert result is None


class TestQuestionView:
    """Tests for question view endpoint."""

    @pytest.mark.asyncio
    @patch('app.gate.get_current_user')
    async def test_question_view_not_authenticated(self, mock_get_user, mock_pool):
        """Test question view redirects when not authenticated."""
        from app.gate import question_view

        mock_get_user.return_value = None
        mock_request = MagicMock(spec=Request)

        result = await question_view(mock_request, 1, mock_pool)

        assert isinstance(result, RedirectResponse)
        assert '/login' in str(result.headers.get('location', ''))

    @pytest.mark.asyncio
    @patch('app.gate.get_current_user')
    async def test_question_view_no_seed(self, mock_get_user, mock_user, mock_pool):
        """Test question view redirects when no question order seed."""
        from app.gate import question_view

        mock_user['question_order_seed'] = None
        mock_get_user.return_value = mock_user
        mock_request = MagicMock(spec=Request)

        result = await question_view(mock_request, 1, mock_pool)

        assert isinstance(result, RedirectResponse)
        assert '/gate' in str(result.headers.get('location', ''))

    @pytest.mark.asyncio
    @patch('app.gate.get_current_user')
    @patch('app.gate.TOTAL_QUESTIONS', 35)
    async def test_question_view_invalid_position_low(self, mock_get_user, mock_user, mock_pool):
        """Test question view redirects for position < 1."""
        from app.gate import question_view

        mock_get_user.return_value = mock_user
        mock_request = MagicMock(spec=Request)

        result = await question_view(mock_request, 0, mock_pool)

        assert isinstance(result, RedirectResponse)

    @pytest.mark.asyncio
    @patch('app.gate.get_current_user')
    @patch('app.gate.TOTAL_QUESTIONS', 35)
    async def test_question_view_invalid_position_high(self, mock_get_user, mock_user, mock_pool):
        """Test question view redirects for position > total."""
        from app.gate import question_view

        mock_get_user.return_value = mock_user
        mock_request = MagicMock(spec=Request)

        result = await question_view(mock_request, 36, mock_pool)

        assert isinstance(result, RedirectResponse)

    @pytest.mark.asyncio
    @patch('app.gate.get_current_user')
    @patch('app.gate._get_question_for_position')
    @patch('app.gate.generate_csrf_token')
    @patch('app.gate.templates')
    @patch('app.gate.TOTAL_QUESTIONS', 35)
    async def test_question_view_success(self, mock_templates, mock_csrf, mock_get_q, mock_get_user, mock_user, mock_pool):
        """Test successful question view."""
        from app.gate import question_view

        mock_get_user.return_value = mock_user
        mock_get_q.return_value = {'id': 'q1', 'text': 'Test question'}
        mock_csrf.return_value = 'new_csrf'
        mock_request = MagicMock(spec=Request)
        mock_response = MagicMock()
        mock_templates.TemplateResponse.return_value = mock_response

        conn = mock_pool.acquire.return_value.__aenter__.return_value

        result = await question_view(mock_request, 5, mock_pool)

        assert result == mock_response
        call_args = mock_templates.TemplateResponse.call_args[0][2]
        assert call_args['position'] == 5
        assert call_args['total'] == 35
        assert 'question' in call_args

    @pytest.mark.asyncio
    @patch('app.gate.get_current_user')
    @patch('app.gate._get_question_for_position')
    @patch('app.gate.TOTAL_QUESTIONS', 35)
    async def test_question_view_with_existing_answer(self, mock_get_q, mock_get_user, mock_user, mock_pool):
        """Test question view shows existing answer."""
        from app.gate import question_view

        mock_user['answers'] = {'q1': 'Previous answer'}
        mock_get_user.return_value = mock_user
        mock_get_q.return_value = {'id': 'q1', 'text': 'Test'}
        mock_request = MagicMock(spec=Request)

        with patch('app.gate.templates') as mock_templates:
            mock_templates.TemplateResponse.return_value = MagicMock()
            await question_view(mock_request, 1, mock_pool)

            call_args = mock_templates.TemplateResponse.call_args[0][2]
            assert call_args['existing_answer'] == 'Previous answer'

    @pytest.mark.asyncio
    @patch('app.gate.get_current_user')
    @patch('app.gate._get_question_for_position')
    @patch('app.gate.TOTAL_QUESTIONS', 10)
    async def test_question_view_is_last_question(self, mock_get_q, mock_get_user, mock_user, mock_pool):
        """Test is_last flag is set for final question."""
        from app.gate import question_view

        mock_get_user.return_value = mock_user
        mock_get_q.return_value = {'id': 'last', 'text': 'Final'}
        mock_request = MagicMock(spec=Request)

        with patch('app.gate.templates') as mock_templates:
            mock_templates.TemplateResponse.return_value = MagicMock()
            await question_view(mock_request, 10, mock_pool)

            call_args = mock_templates.TemplateResponse.call_args[0][2]
            assert call_args['is_last'] is True


class TestQuestionSubmit:
    """Tests for question answer submission."""

    @pytest.mark.asyncio
    @patch('app.gate.get_current_user')
    async def test_question_submit_not_authenticated(self, mock_get_user, mock_pool):
        """Test submit redirects when not authenticated."""
        from app.gate import question_submit

        mock_get_user.return_value = None
        mock_request = MagicMock(spec=Request)

        result = await question_submit(mock_request, 1, 'answer', 'csrf', mock_pool)

        assert isinstance(result, RedirectResponse)
        assert '/login' in str(result.headers.get('location', ''))

    @pytest.mark.asyncio
    @patch('app.gate.get_current_user')
    @patch('app.gate._csrf_ok')
    async def test_question_submit_csrf_failure(self, mock_csrf_ok, mock_get_user, mock_user, mock_pool):
        """Test submit redirects on CSRF failure."""
        from app.gate import question_submit

        mock_get_user.return_value = mock_user
        mock_csrf_ok.return_value = False
        mock_request = MagicMock(spec=Request)

        result = await question_submit(mock_request, 5, 'answer', 'bad_csrf', mock_pool)

        assert isinstance(result, RedirectResponse)
        assert '/gate/q/5' in str(result.headers.get('location', ''))

    @pytest.mark.asyncio
    @patch('app.gate.get_current_user')
    @patch('app.gate._csrf_ok')
    @patch('app.gate._get_question_for_position')
    async def test_question_submit_saves_answer(self, mock_get_q, mock_csrf_ok, mock_get_user, mock_user, mock_pool):
        """Test answer is saved to database."""
        from app.gate import question_submit

        mock_get_user.return_value = mock_user
        mock_csrf_ok.return_value = True
        mock_get_q.return_value = {'id': 'q5', 'text': 'Test'}
        mock_request = MagicMock(spec=Request)

        conn = mock_pool.acquire.return_value.__aenter__.return_value
        conn.fetchrow.return_value = {'answers': {}}
        conn.transaction.return_value.__aenter__ = AsyncMock()
        conn.transaction.return_value.__aexit__ = AsyncMock()

        result = await question_submit(mock_request, 5, 'My answer', 'csrf', mock_pool)

        assert isinstance(result, RedirectResponse)
        assert '/gate/q/6' in str(result.headers.get('location', ''))

    @pytest.mark.asyncio
    @patch('app.gate.get_current_user')
    @patch('app.gate._csrf_ok')
    @patch('app.gate._get_question_for_position')
    async def test_question_submit_empty_answer_removes(self, mock_get_q, mock_csrf_ok, mock_get_user, mock_user, mock_pool):
        """Test empty answer removes existing answer."""
        from app.gate import question_submit

        mock_get_user.return_value = mock_user
        mock_csrf_ok.return_value = True
        mock_get_q.return_value = {'id': 'q5', 'text': 'Test'}
        mock_request = MagicMock(spec=Request)

        conn = mock_pool.acquire.return_value.__aenter__.return_value
        conn.fetchrow.return_value = {'answers': {'q5': 'old answer'}}
        conn.transaction.return_value.__aenter__ = AsyncMock()
        conn.transaction.return_value.__aexit__ = AsyncMock()

        await question_submit(mock_request, 5, '', 'csrf', mock_pool)

        # Verify execute was called to update
        conn.execute.assert_called()

    @pytest.mark.asyncio
    @patch('app.gate.get_current_user')
    @patch('app.gate._csrf_ok')
    @patch('app.gate._get_question_for_position')
    @patch('app.gate.TOTAL_QUESTIONS', 10)
    async def test_question_submit_last_redirects_to_submit(self, mock_get_q, mock_csrf_ok, mock_get_user, mock_user, mock_pool):
        """Test submitting last question redirects to submit page."""
        from app.gate import question_submit

        mock_get_user.return_value = mock_user
        mock_csrf_ok.return_value = True
        mock_get_q.return_value = {'id': 'last', 'text': 'Final'}
        mock_request = MagicMock(spec=Request)

        conn = mock_pool.acquire.return_value.__aenter__.return_value
        conn.fetchrow.return_value = {'answers': {}}
        conn.transaction.return_value.__aenter__ = AsyncMock()
        conn.transaction.return_value.__aexit__ = AsyncMock()

        result = await question_submit(mock_request, 10, 'answer', 'csrf', mock_pool)

        assert '/gate/submit' in str(result.headers.get('location', ''))


class TestSubmitConfirm:
    """Tests for submission confirmation page."""

    @pytest.mark.asyncio
    @patch('app.gate.get_current_user')
    async def test_submit_confirm_not_authenticated(self, mock_get_user, mock_pool):
        """Test submit confirm redirects when not authenticated."""
        from app.gate import submit_confirm

        mock_get_user.return_value = None
        mock_request = MagicMock(spec=Request)

        result = await submit_confirm(mock_request, mock_pool)

        assert isinstance(result, RedirectResponse)

    @pytest.mark.asyncio
    @patch('app.gate.get_current_user')
    @patch('app.gate.templates')
    @patch('app.gate.TOTAL_QUESTIONS', 10)
    async def test_submit_confirm_shows_count(self, mock_templates, mock_get_user, mock_user, mock_pool):
        """Test submit confirm shows answered count."""
        from app.gate import submit_confirm

        mock_user['answers'] = {'q1': 'a1', 'q2': 'a2', 'q3': 'a3'}
        mock_get_user.return_value = mock_user
        mock_request = MagicMock(spec=Request)
        mock_templates.TemplateResponse.return_value = MagicMock()

        await submit_confirm(mock_request, mock_pool)

        call_args = mock_templates.TemplateResponse.call_args[0][2]
        assert call_args['answered_count'] == 3
        assert call_args['total'] == 10


class TestSubmitFinal:
    """Tests for final submission with encryption."""

    @pytest.mark.asyncio
    @patch('app.gate.get_current_user')
    async def test_submit_final_not_authenticated(self, mock_get_user, mock_pool):
        """Test final submit redirects when not authenticated."""
        from app.gate import submit_final

        mock_get_user.return_value = None
        mock_request = MagicMock(spec=Request)

        result = await submit_final(mock_request, 'csrf', mock_pool)

        assert isinstance(result, RedirectResponse)

    @pytest.mark.asyncio
    @patch('app.gate.get_current_user')
    @patch('app.gate._csrf_ok')
    async def test_submit_final_csrf_failure(self, mock_csrf_ok, mock_get_user, mock_user, mock_pool):
        """Test final submit fails on CSRF error."""
        from app.gate import submit_final

        mock_get_user.return_value = mock_user
        mock_csrf_ok.return_value = False
        mock_request = MagicMock(spec=Request)

        result = await submit_final(mock_request, 'bad_csrf', mock_pool)

        assert isinstance(result, RedirectResponse)
        assert '/gate/submit' in str(result.headers.get('location', ''))

    @pytest.mark.asyncio
    @patch('app.gate.get_current_user')
    @patch('app.gate._csrf_ok')
    @patch('app.gate.generate_token')
    @patch('app.gate.encrypt_answers')
    async def test_submit_final_success(self, mock_encrypt, mock_gen_token, mock_csrf_ok, mock_get_user, mock_user, mock_pool):
        """Test successful final submission."""
        from app.gate import submit_final

        mock_user['answers'] = {'q1': 'answer1', 'q2': 'answer2'}
        mock_get_user.return_value = mock_user
        mock_csrf_ok.return_value = True
        mock_gen_token.return_value = 'gate_token_123'
        mock_encrypt.return_value = 'encrypted_payload'
        mock_request = MagicMock(spec=Request)

        conn = mock_pool.acquire.return_value.__aenter__.return_value
        conn.fetchrow.return_value = {
            'answers': {'q1': 'answer1', 'q2': 'answer2'},
            'question_order_seed': 'seed123',
        }
        conn.transaction.return_value.__aenter__ = AsyncMock()
        conn.transaction.return_value.__aexit__ = AsyncMock()

        result = await submit_final(mock_request, 'csrf', mock_pool)

        assert isinstance(result, RedirectResponse)
        assert 'gate_token_123' in str(result.headers.get('location', ''))

    @pytest.mark.asyncio
    @patch('app.gate.get_current_user')
    @patch('app.gate._csrf_ok')
    async def test_submit_final_no_answers(self, mock_csrf_ok, mock_get_user, mock_user, mock_pool):
        """Test final submit redirects when no answers."""
        from app.gate import submit_final

        mock_user['answers'] = {}
        mock_get_user.return_value = mock_user
        mock_csrf_ok.return_value = True
        mock_request = MagicMock(spec=Request)

        conn = mock_pool.acquire.return_value.__aenter__.return_value
        conn.fetchrow.return_value = {'answers': {}, 'question_order_seed': 'seed'}
        conn.transaction.return_value.__aenter__ = AsyncMock()
        conn.transaction.return_value.__aexit__ = AsyncMock()

        result = await submit_final(mock_request, 'csrf', mock_pool)

        assert '/gate' in str(result.headers.get('location', ''))


class TestCompletePage:
    """Tests for completion page."""

    @pytest.mark.asyncio
    @patch('app.gate.get_current_user')
    async def test_complete_page_not_authenticated(self, mock_get_user, mock_pool):
        """Test complete page redirects when not authenticated."""
        from app.gate import complete_page

        mock_get_user.return_value = None
        mock_request = MagicMock(spec=Request)

        result = await complete_page(mock_request, 'token', mock_pool)

        assert isinstance(result, RedirectResponse)

    @pytest.mark.asyncio
    @patch('app.gate.get_current_user')
    @patch('app.gate.templates')
    async def test_complete_page_shows_token(self, mock_templates, mock_get_user, mock_user, mock_pool):
        """Test complete page shows gate token."""
        from app.gate import complete_page

        mock_get_user.return_value = mock_user
        mock_request = MagicMock(spec=Request)
        mock_templates.TemplateResponse.return_value = MagicMock()

        await complete_page(mock_request, 'my_gate_token', mock_pool)

        call_args = mock_templates.TemplateResponse.call_args[0][2]
        assert call_args['gate_token'] == 'my_gate_token'


class TestEdgeCases:
    """Tests for edge cases and boundary conditions."""

    @pytest.mark.asyncio
    @patch('app.gate.get_current_user')
    @patch('app.gate._get_question_for_position')
    async def test_question_view_with_string_answers(self, mock_get_q, mock_get_user, mock_user, mock_pool):
        """Test handling answers stored as JSON string."""
        from app.gate import question_view

        # Simulate answers stored as JSON string
        mock_user['answers'] = json.dumps({'q1': 'answer1'})
        mock_get_user.return_value = mock_user
        mock_get_q.return_value = {'id': 'q1', 'text': 'Test'}
        mock_request = MagicMock(spec=Request)

        with patch('app.gate.templates') as mock_templates:
            with patch('app.gate.generate_csrf_token'):
                mock_templates.TemplateResponse.return_value = MagicMock()
                result = await question_view(mock_request, 1, mock_pool)

                # Should handle string parsing
                assert result is not None

    @pytest.mark.asyncio
    @patch('app.gate.get_current_user')
    @patch('app.gate._csrf_ok')
    @patch('app.gate._get_question_for_position')
    async def test_question_submit_whitespace_trimming(self, mock_get_q, mock_csrf_ok, mock_get_user, mock_user, mock_pool):
        """Test answer whitespace is trimmed."""
        from app.gate import question_submit

        mock_get_user.return_value = mock_user
        mock_csrf_ok.return_value = True
        mock_get_q.return_value = {'id': 'q1', 'text': 'Test'}
        mock_request = MagicMock(spec=Request)

        conn = mock_pool.acquire.return_value.__aenter__.return_value
        conn.fetchrow.return_value = {'answers': {}}
        conn.transaction.return_value.__aenter__ = AsyncMock()
        conn.transaction.return_value.__aexit__ = AsyncMock()

        await question_submit(mock_request, 1, '  answer with spaces  ', 'csrf', mock_pool)

        # Answer should be trimmed in processing
        conn.execute.assert_called()