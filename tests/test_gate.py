"""Tests for app/gate.py questionnaire module."""

import json
import pytest
from unittest.mock import Mock, AsyncMock, patch, MagicMock
from tests.test_helpers import make_async_pool_mock
from fastapi.responses import RedirectResponse


def test_require_user_with_none():
    """Test _require_user returns None when user is None."""
    from app.gate import _require_user

    result = _require_user(None)

    assert result is None


def test_require_user_with_redirect_response():
    """Test _require_user returns None for RedirectResponse."""
    from app.gate import _require_user

    redirect = RedirectResponse(url='/login')
    result = _require_user(redirect)

    assert result is None


def test_require_user_with_valid_user():
    """Test _require_user returns user dict when valid."""
    from app.gate import _require_user

    user = {'user_id': 1, 'handle': 'test'}
    result = _require_user(user)

    assert result == user


def test_csrf_ok_valid():
    """Test _csrf_ok with matching CSRF tokens."""
    from app.gate import _csrf_ok

    request = Mock()
    request.cookies.get = Mock(return_value='csrf_token_123')

    result = _csrf_ok(request, 'csrf_token_123')

    assert result is True


def test_csrf_ok_mismatch():
    """Test _csrf_ok with mismatched CSRF tokens."""
    from app.gate import _csrf_ok

    request = Mock()
    request.cookies.get = Mock(return_value='csrf_token_123')

    result = _csrf_ok(request, 'csrf_token_456')

    assert result is False


def test_csrf_ok_missing_cookie():
    """Test _csrf_ok when CSRF cookie is missing."""
    from app.gate import _csrf_ok

    request = Mock()
    request.cookies.get = Mock(return_value=None)

    result = _csrf_ok(request, 'csrf_token_123')

    assert result is False


def test_get_question_for_position_gate_question():
    """Test _get_question_for_position returns gate questions for positions 1-2."""
    from app.gate import _get_question_for_position

    with patch('app.gate.GATE_QUESTIONS', [Mock(id='gate1'), Mock(id='gate2')]):
        result = _get_question_for_position(1, 'seed123')
        assert result.id == 'gate1'

        result = _get_question_for_position(2, 'seed123')
        assert result.id == 'gate2'


def test_get_question_for_position_main_question():
    """Test _get_question_for_position returns shuffled main questions."""
    from app.gate import _get_question_for_position

    mock_question = Mock(id='q1')

    with patch('app.gate.GATE_QUESTIONS', [Mock(), Mock()]):  # 2 gate questions
        with patch('app.gate.shuffle_questions', return_value=['q1', 'q2', 'q3']):
            with patch('app.gate.QUESTIONS', [mock_question, Mock(id='q2'), Mock(id='q3')]):
                # Position 3 is first main question (index 0 in shuffled list)
                result = _get_question_for_position(3, 'seed123')

                assert result.id == 'q1'


def test_get_question_for_position_out_of_range():
    """Test _get_question_for_position returns None for invalid position."""
    from app.gate import _get_question_for_position

    with patch('app.gate.GATE_QUESTIONS', [Mock()]):
        with patch('app.gate.shuffle_questions', return_value=['q1']):
            with patch('app.gate.QUESTIONS', [Mock(id='q1')]):
                # Position beyond available questions
                result = _get_question_for_position(100, 'seed123')

                assert result is None


@pytest.mark.asyncio
async def test_gate_landing_no_user_redirects():
    """Test gate_landing redirects to login when no user."""
    from app.gate import gate_landing

    with patch('app.gate.get_current_user', new_callable=AsyncMock, return_value=None):
        request = Mock()
        mock_pool = AsyncMock()

        response = await gate_landing(request, mock_pool)

        assert isinstance(response, RedirectResponse)
        assert response.headers['location'] == '/login'


@pytest.mark.asyncio
async def test_gate_landing_with_user():
    """Test gate_landing renders template when user authenticated."""
    from app.gate import gate_landing

    user = {'user_id': 1, 'handle': 'test'}

    with patch('app.gate.get_current_user', new_callable=AsyncMock, return_value=user):
        with patch('app.gate.templates') as mock_templates:
            mock_templates.TemplateResponse = Mock(return_value=Mock())

            with patch('app.gate.generate_csrf_token', return_value='csrf'):
                with patch('app.gate.set_csrf_cookie'):
                    with patch('app.gate.GATE_QUESTIONS', []):
                        with patch('app.gate.TOTAL_QUESTIONS', 35):
                            request = Mock()
                            mock_pool = AsyncMock()

                            response = await gate_landing(request, mock_pool)

                            mock_templates.TemplateResponse.assert_called()


@pytest.mark.asyncio
async def test_gate_start_no_user_redirects():
    """Test gate_start redirects when no user."""
    from app.gate import gate_start

    with patch('app.gate.get_current_user', new_callable=AsyncMock, return_value=None):
        request = Mock()
        mock_pool = AsyncMock()

        response = await gate_start(request, csrf_token='token', pool=mock_pool)

        assert isinstance(response, RedirectResponse)
        assert response.headers['location'] == '/login'


@pytest.mark.asyncio
async def test_gate_start_invalid_csrf_redirects():
    """Test gate_start redirects on invalid CSRF."""
    from app.gate import gate_start

    user = {'user_id': 1, 'sid': 'session123'}

    with patch('app.gate.get_current_user', new_callable=AsyncMock, return_value=user):
        with patch('app.gate._csrf_ok', return_value=False):
            request = Mock()
            mock_pool = AsyncMock()

            response = await gate_start(request, csrf_token='bad_token', pool=mock_pool)

            assert isinstance(response, RedirectResponse)
            assert response.headers['location'] == '/gate'


@pytest.mark.asyncio
async def test_gate_start_success():
    """Test gate_start initializes session and redirects to first question."""
    from app.gate import gate_start

    user = {'user_id': 1, 'sid': 'session123'}

    with patch('app.gate.get_current_user', new_callable=AsyncMock, return_value=user):
        with patch('app.gate._csrf_ok', return_value=True):
            with patch('app.gate.generate_token', return_value='new_seed'):
                mock_conn = AsyncMock()
                mock_conn.execute = AsyncMock()

                mock_pool = make_async_pool_mock(mock_conn)

                request = Mock()

                response = await gate_start(request, csrf_token='token', pool=mock_pool)

                assert isinstance(response, RedirectResponse)
                assert response.headers['location'] == '/gate/q/1'
                mock_conn.execute.assert_called_once()


@pytest.mark.asyncio
async def test_question_view_no_user_redirects():
    """Test question_view redirects when no user."""
    from app.gate import question_view

    with patch('app.gate.get_current_user', new_callable=AsyncMock, return_value=None):
        request = Mock()
        mock_pool = AsyncMock()

        response = await question_view(request, n=1, pool=mock_pool)

        assert isinstance(response, RedirectResponse)
        assert response.headers['location'] == '/login'


@pytest.mark.asyncio
async def test_question_view_no_seed_redirects():
    """Test question_view redirects when no question_order_seed."""
    from app.gate import question_view

    user = {'user_id': 1, 'question_order_seed': None}

    with patch('app.gate.get_current_user', new_callable=AsyncMock, return_value=user):
        request = Mock()
        mock_pool = AsyncMock()

        response = await question_view(request, n=1, pool=mock_pool)

        assert isinstance(response, RedirectResponse)
        assert response.headers['location'] == '/gate'


@pytest.mark.asyncio
async def test_question_view_invalid_position_redirects():
    """Test question_view redirects for invalid question number."""
    from app.gate import question_view

    user = {'user_id': 1, 'question_order_seed': 'seed123', 'sid': 'session123'}

    with patch('app.gate.get_current_user', new_callable=AsyncMock, return_value=user):
        with patch('app.gate.TOTAL_QUESTIONS', 35):
            request = Mock()
            mock_pool = AsyncMock()

            # Test n < 1
            response = await question_view(request, n=0, pool=mock_pool)
            assert isinstance(response, RedirectResponse)

            # Test n > TOTAL_QUESTIONS
            response = await question_view(request, n=100, pool=mock_pool)
            assert isinstance(response, RedirectResponse)


@pytest.mark.asyncio
async def test_question_view_success():
    """Test question_view renders question template."""
    from app.gate import question_view

    mock_question = Mock(id='q1')
    user = {
        'user_id': 1,
        'question_order_seed': 'seed123',
        'sid': 'session123',
        'answers': {}
    }

    with patch('app.gate.get_current_user', new_callable=AsyncMock, return_value=user):
        with patch('app.gate._get_question_for_position', return_value=mock_question):
            with patch('app.gate.TOTAL_QUESTIONS', 35):
                with patch('app.gate.generate_csrf_token', return_value='csrf'):
                    with patch('app.gate.templates') as mock_templates:
                        mock_templates.TemplateResponse = Mock(return_value=Mock())

                        with patch('app.gate.set_csrf_cookie'):
                            mock_conn = AsyncMock()
                            mock_conn.execute = AsyncMock()

                            mock_pool = make_async_pool_mock(mock_conn)

                            request = Mock()

                            response = await question_view(request, n=1, pool=mock_pool)

                            mock_templates.TemplateResponse.assert_called()


@pytest.mark.asyncio
async def test_question_submit_no_user_redirects():
    """Test question_submit redirects when no user."""
    from app.gate import question_submit

    with patch('app.gate.get_current_user', new_callable=AsyncMock, return_value=None):
        request = Mock()
        mock_pool = AsyncMock()

        response = await question_submit(
            request, n=1, answer='test', csrf_token='token', pool=mock_pool
        )

        assert isinstance(response, RedirectResponse)
        assert response.headers['location'] == '/login'


@pytest.mark.asyncio
async def test_question_submit_invalid_csrf():
    """Test question_submit redirects on invalid CSRF."""
    from app.gate import question_submit

    user = {'user_id': 1}

    with patch('app.gate.get_current_user', new_callable=AsyncMock, return_value=user):
        with patch('app.gate._csrf_ok', return_value=False):
            request = Mock()
            mock_pool = AsyncMock()

            response = await question_submit(
                request, n=1, answer='test', csrf_token='bad', pool=mock_pool
            )

            assert isinstance(response, RedirectResponse)
            assert response.headers['location'] == '/gate/q/1'


@pytest.mark.asyncio
async def test_question_submit_saves_answer():
    """Test question_submit saves answer and redirects to next question."""
    from app.gate import question_submit

    mock_question = Mock(id='q1')
    user = {
        'user_id': 1,
        'sid': 'session123',
        'question_order_seed': 'seed123'
    }

    with patch('app.gate.get_current_user', new_callable=AsyncMock, return_value=user):
        with patch('app.gate._csrf_ok', return_value=True):
            with patch('app.gate._get_question_for_position', return_value=mock_question):
                with patch('app.gate.TOTAL_QUESTIONS', 35):
                    mock_conn = AsyncMock()
                    mock_conn.fetchrow = AsyncMock(return_value={'answers': {}})
                    mock_conn.execute = AsyncMock()
                    mock_conn.transaction = MagicMock()
                    mock_conn.transaction.return_value.__aenter__ = AsyncMock()
                    mock_conn.transaction.return_value.__aexit__ = AsyncMock()

                    mock_pool = make_async_pool_mock(mock_conn)

                    request = Mock()

                    response = await question_submit(
                        request, n=1, answer='my answer', csrf_token='token', pool=mock_pool
                    )

                    assert isinstance(response, RedirectResponse)
                    assert '/gate/q/2' in response.headers['location']


@pytest.mark.asyncio
async def test_question_submit_last_question_redirects_to_submit():
    """Test question_submit redirects to submit page after last question."""
    from app.gate import question_submit

    mock_question = Mock(id='q35')
    user = {
        'user_id': 1,
        'sid': 'session123',
        'question_order_seed': 'seed123'
    }

    with patch('app.gate.get_current_user', new_callable=AsyncMock, return_value=user):
        with patch('app.gate._csrf_ok', return_value=True):
            with patch('app.gate._get_question_for_position', return_value=mock_question):
                with patch('app.gate.TOTAL_QUESTIONS', 35):
                    mock_conn = AsyncMock()
                    mock_conn.fetchrow = AsyncMock(return_value={'answers': {}})
                    mock_conn.execute = AsyncMock()
                    mock_conn.transaction = MagicMock()
                    mock_conn.transaction.return_value.__aenter__ = AsyncMock()
                    mock_conn.transaction.return_value.__aexit__ = AsyncMock()

                    mock_pool = make_async_pool_mock(mock_conn)

                    request = Mock()

                    response = await question_submit(
                        request, n=35, answer='final answer', csrf_token='token', pool=mock_pool
                    )

                    assert isinstance(response, RedirectResponse)
                    assert '/gate/submit' in response.headers['location']


@pytest.mark.asyncio
async def test_submit_confirm_no_user_redirects():
    """Test submit_confirm redirects when no user."""
    from app.gate import submit_confirm

    with patch('app.gate.get_current_user', new_callable=AsyncMock, return_value=None):
        request = Mock()
        mock_pool = AsyncMock()

        response = await submit_confirm(request, mock_pool)

        assert isinstance(response, RedirectResponse)
        assert response.headers['location'] == '/login'


@pytest.mark.asyncio
async def test_submit_confirm_renders_template():
    """Test submit_confirm renders confirmation template."""
    from app.gate import submit_confirm

    user = {
        'user_id': 1,
        'answers': {'q1': 'answer1', 'q2': 'answer2'}
    }

    with patch('app.gate.get_current_user', new_callable=AsyncMock, return_value=user):
        with patch('app.gate.templates') as mock_templates:
            mock_templates.TemplateResponse = Mock(return_value=Mock())

            with patch('app.gate.generate_csrf_token', return_value='csrf'):
                with patch('app.gate.set_csrf_cookie'):
                    with patch('app.gate.TOTAL_QUESTIONS', 35):
                        request = Mock()
                        mock_pool = AsyncMock()

                        response = await submit_confirm(request, mock_pool)

                        mock_templates.TemplateResponse.assert_called()
                        context = mock_templates.TemplateResponse.call_args[0][2]
                        assert context['answered_count'] == 2


@pytest.mark.asyncio
async def test_submit_final_no_user_redirects():
    """Test submit_final redirects when no user."""
    from app.gate import submit_final

    with patch('app.gate.get_current_user', new_callable=AsyncMock, return_value=None):
        request = Mock()
        mock_pool = AsyncMock()

        response = await submit_final(request, csrf_token='token', pool=mock_pool)

        assert isinstance(response, RedirectResponse)
        assert response.headers['location'] == '/login'


@pytest.mark.asyncio
async def test_submit_final_invalid_csrf():
    """Test submit_final redirects on invalid CSRF."""
    from app.gate import submit_final

    user = {'user_id': 1}

    with patch('app.gate.get_current_user', new_callable=AsyncMock, return_value=user):
        with patch('app.gate._csrf_ok', return_value=False):
            request = Mock()
            mock_pool = AsyncMock()

            response = await submit_final(request, csrf_token='bad', pool=mock_pool)

            assert isinstance(response, RedirectResponse)
            assert '/gate/submit' in response.headers['location']


@pytest.mark.asyncio
async def test_submit_final_success():
    """Test submit_final encrypts and stores answers."""
    from app.gate import submit_final

    user = {
        'user_id': 1,
        'sid': 'session123'
    }

    with patch('app.gate.get_current_user', new_callable=AsyncMock, return_value=user):
        with patch('app.gate._csrf_ok', return_value=True):
            with patch('app.gate.generate_token', return_value='gate_token_123'):
                with patch('app.gate.encrypt_answers', return_value='encrypted_data'):
                    mock_conn = AsyncMock()
                    mock_conn.fetchrow = AsyncMock(return_value={
                        'answers': {'q1': 'answer1'},
                        'question_order_seed': 'seed123'
                    })
                    mock_conn.execute = AsyncMock()
                    mock_conn.transaction = MagicMock()
                    mock_conn.transaction.return_value.__aenter__ = AsyncMock()
                    mock_conn.transaction.return_value.__aexit__ = AsyncMock()

                    mock_pool = make_async_pool_mock(mock_conn)

                    request = Mock()

                    response = await submit_final(request, csrf_token='token', pool=mock_pool)

                    assert isinstance(response, RedirectResponse)
                    assert 'gate_token_123' in response.headers['location']


@pytest.mark.asyncio
async def test_complete_page_no_user_redirects():
    """Test complete_page redirects when no user."""
    from app.gate import complete_page

    with patch('app.gate.get_current_user', new_callable=AsyncMock, return_value=None):
        request = Mock()
        mock_pool = AsyncMock()

        response = await complete_page(request, token='token123', pool=mock_pool)

        assert isinstance(response, RedirectResponse)
        assert response.headers['location'] == '/login'


@pytest.mark.asyncio
async def test_complete_page_renders_template():
    """Test complete_page renders completion template."""
    from app.gate import complete_page

    user = {'user_id': 1}

    with patch('app.gate.get_current_user', new_callable=AsyncMock, return_value=user):
        with patch('app.gate.templates') as mock_templates:
            mock_templates.TemplateResponse = Mock(return_value=Mock())

            request = Mock()
            mock_pool = AsyncMock()

            response = await complete_page(request, token='token123', pool=mock_pool)

            mock_templates.TemplateResponse.assert_called()
            context = mock_templates.TemplateResponse.call_args[0][2]
            assert context['gate_token'] == 'token123'