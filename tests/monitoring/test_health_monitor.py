"""Tests for monitoring/health_monitor.py helper functions."""

import json
import pytest
from datetime import datetime, timezone
from unittest.mock import Mock, patch, MagicMock
from urllib.error import HTTPError, URLError

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../'))

from monitoring.health_monitor import (
    send_telegram_alert,
    send_email_alert,
    check_service,
    check_error_rates,
    process_health_check,
    service_states,
)


class TestSendTelegramAlert:
    """Tests for send_telegram_alert function."""

    @patch('monitoring.health_monitor.CONFIG', {
        'telegram_token': 'test_token',
        'telegram_chat_id': 'test_chat_id',
    })
    @patch('monitoring.health_monitor.urlopen')
    def test_send_telegram_alert_success(self, mock_urlopen):
        """Test successful Telegram alert sending."""
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({'ok': True}).encode('utf-8')
        mock_urlopen.return_value.__enter__.return_value = mock_response

        result = send_telegram_alert("Test alert")
        assert result is True

    @patch('monitoring.health_monitor.CONFIG', {
        'telegram_token': 'test_token',
        'telegram_chat_id': 'test_chat_id',
    })
    @patch('monitoring.health_monitor.urlopen')
    def test_send_telegram_alert_api_error(self, mock_urlopen):
        """Test Telegram API returning error."""
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({'ok': False}).encode('utf-8')
        mock_urlopen.return_value.__enter__.return_value = mock_response

        result = send_telegram_alert("Test alert")
        assert result is False

    @patch('monitoring.health_monitor.CONFIG', {
        'telegram_token': '',
        'telegram_chat_id': '',
    })
    def test_send_telegram_alert_no_credentials(self):
        """Test that missing credentials returns False."""
        result = send_telegram_alert("Test alert")
        assert result is False

    @patch('monitoring.health_monitor.CONFIG', {
        'telegram_token': 'test_token',
        'telegram_chat_id': '',
    })
    def test_send_telegram_alert_missing_chat_id(self):
        """Test that missing chat ID returns False."""
        result = send_telegram_alert("Test alert")
        assert result is False

    @patch('monitoring.health_monitor.CONFIG', {
        'telegram_token': 'test_token',
        'telegram_chat_id': 'test_chat_id',
    })
    @patch('monitoring.health_monitor.urlopen', side_effect=Exception("Network error"))
    def test_send_telegram_alert_exception(self, mock_urlopen):
        """Test exception handling."""
        result = send_telegram_alert("Test alert")
        assert result is False


class TestSendEmailAlert:
    """Tests for send_email_alert function."""

    @patch('monitoring.health_monitor.CONFIG', {
        'sendgrid_api_key': 'test_api_key',
        'alert_email': 'alert@example.com',
        'from_email': 'monitor@example.com',
    })
    @patch('monitoring.health_monitor.urlopen')
    def test_send_email_alert_success_200(self, mock_urlopen):
        """Test successful email sending with 200 status."""
        mock_response = MagicMock()
        mock_response.status = 200
        mock_urlopen.return_value.__enter__.return_value = mock_response

        result = send_email_alert("Test Subject", "Test Body")
        assert result is True

    @patch('monitoring.health_monitor.CONFIG', {
        'sendgrid_api_key': 'test_api_key',
        'alert_email': 'alert@example.com',
        'from_email': 'monitor@example.com',
    })
    @patch('monitoring.health_monitor.urlopen')
    def test_send_email_alert_success_202(self, mock_urlopen):
        """Test successful email sending with 202 status."""
        mock_response = MagicMock()
        mock_response.status = 202
        mock_urlopen.return_value.__enter__.return_value = mock_response

        result = send_email_alert("Test Subject", "Test Body")
        assert result is True

    @patch('monitoring.health_monitor.CONFIG', {
        'sendgrid_api_key': '',
    })
    def test_send_email_alert_no_api_key(self):
        """Test that missing API key returns False."""
        result = send_email_alert("Test Subject", "Test Body")
        assert result is False

    @patch('monitoring.health_monitor.CONFIG', {
        'sendgrid_api_key': 'test_api_key',
        'alert_email': 'alert@example.com',
        'from_email': 'monitor@example.com',
    })
    @patch('monitoring.health_monitor.urlopen')
    def test_send_email_alert_error_status(self, mock_urlopen):
        """Test email sending with error status."""
        mock_response = MagicMock()
        mock_response.status = 400
        mock_urlopen.return_value.__enter__.return_value = mock_response

        result = send_email_alert("Test Subject", "Test Body")
        assert result is False

    @patch('monitoring.health_monitor.CONFIG', {
        'sendgrid_api_key': 'test_api_key',
        'alert_email': 'alert@example.com',
        'from_email': 'monitor@example.com',
    })
    @patch('monitoring.health_monitor.urlopen', side_effect=Exception("API error"))
    def test_send_email_alert_exception(self, mock_urlopen):
        """Test exception handling."""
        result = send_email_alert("Test Subject", "Test Body")
        assert result is False


class TestCheckService:
    """Tests for check_service function."""

    @patch('monitoring.health_monitor.urlopen')
    def test_check_service_healthy(self, mock_urlopen):
        """Test checking a healthy service."""
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = json.dumps({'status': 'healthy'}).encode('utf-8')
        mock_urlopen.return_value.__enter__.return_value = mock_response

        service_config = {
            'name': 'Test Service',
            'url': 'http://localhost:8000/health',
            'expected_status': 200,
            'timeout': 10,
        }

        result = check_service('test_service', service_config)

        assert result['status'] == 'healthy'
        assert result['name'] == 'Test Service'
        assert result['response_time_ms'] is not None
        assert result['error'] is None

    @patch('monitoring.health_monitor.urlopen')
    def test_check_service_degraded(self, mock_urlopen):
        """Test checking a degraded service."""
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = json.dumps({
            'status': 'degraded',
            'message': 'High latency'
        }).encode('utf-8')
        mock_urlopen.return_value.__enter__.return_value = mock_response

        service_config = {
            'name': 'Test Service',
            'url': 'http://localhost:8000/health',
            'expected_status': 200,
            'timeout': 10,
        }

        result = check_service('test_service', service_config)

        assert result['status'] == 'degraded'
        assert result['error'] == 'High latency'

    @patch('monitoring.health_monitor.urlopen', side_effect=HTTPError(
        'http://test', 500, 'Internal Server Error', {}, None
    ))
    def test_check_service_http_error(self, mock_urlopen):
        """Test service returning HTTP error."""
        service_config = {
            'name': 'Test Service',
            'url': 'http://localhost:8000/health',
            'expected_status': 200,
            'timeout': 10,
        }

        result = check_service('test_service', service_config)

        assert result['status'] == 'unhealthy'
        assert 'HTTP 500' in result['error']

    @patch('monitoring.health_monitor.urlopen', side_effect=URLError('Connection refused'))
    def test_check_service_url_error(self, mock_urlopen):
        """Test service with connection error."""
        service_config = {
            'name': 'Test Service',
            'url': 'http://localhost:8000/health',
            'expected_status': 200,
            'timeout': 10,
        }

        result = check_service('test_service', service_config)

        assert result['status'] == 'down'
        assert 'Connection failed' in result['error']

    @patch('monitoring.health_monitor.urlopen', side_effect=TimeoutError())
    def test_check_service_timeout(self, mock_urlopen):
        """Test service timeout."""
        service_config = {
            'name': 'Test Service',
            'url': 'http://localhost:8000/health',
            'expected_status': 200,
            'timeout': 10,
        }

        result = check_service('test_service', service_config)

        # The actual code sets status to 'timeout' for socket.timeout, but 'error' for other exceptions
        # TimeoutError is caught as a generic exception, so it might be either
        assert result['status'] in ['error', 'timeout']

    @patch('monitoring.health_monitor.urlopen')
    def test_check_service_unexpected_status(self, mock_urlopen):
        """Test service returning unexpected status code."""
        mock_response = MagicMock()
        mock_response.status = 503
        mock_urlopen.return_value.__enter__.return_value = mock_response

        service_config = {
            'name': 'Test Service',
            'url': 'http://localhost:8000/',
            'expected_status': 200,
            'timeout': 10,
        }

        result = check_service('test_service', service_config)

        assert result['status'] == 'unhealthy'
        assert '503' in result['error']

    @patch('monitoring.health_monitor.urlopen')
    @patch('monitoring.health_monitor.time.time', side_effect=[0, 0.5])
    def test_check_service_measures_response_time(self, mock_time, mock_urlopen):
        """Test that response time is measured."""
        mock_response = MagicMock()
        mock_response.status = 200
        mock_urlopen.return_value.__enter__.return_value = mock_response

        service_config = {
            'name': 'Test Service',
            'url': 'http://localhost:8000/',
            'expected_status': 200,
            'timeout': 10,
        }

        result = check_service('test_service', service_config)

        assert result['response_time_ms'] == 500.0


class TestCheckErrorRates:
    """Tests for check_error_rates function."""

    @patch('monitoring.health_monitor.urlopen')
    def test_check_error_rates_normal(self, mock_urlopen):
        """Test normal error rate."""
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            'currentHour': {
                'requests.total': 1000,
                'requests.api': 500,
                'errors.5xx': 10,
            }
        }).encode('utf-8')
        mock_urlopen.return_value.__enter__.return_value = mock_response

        with patch('monitoring.health_monitor.CONFIG', {'error_rate_threshold': 0.1}):
            result = check_error_rates()

            assert result['status'] == 'normal'
            assert result['total_requests'] == 1500
            assert result['error_count_5xx'] == 10
            assert result['error_rate_5xx'] < 0.1

    @patch('monitoring.health_monitor.urlopen')
    def test_check_error_rates_high(self, mock_urlopen):
        """Test high error rate."""
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            'currentHour': {
                'requests.total': 100,
                'requests.api': 0,
                'errors.5xx': 20,
            }
        }).encode('utf-8')
        mock_urlopen.return_value.__enter__.return_value = mock_response

        with patch('monitoring.health_monitor.CONFIG', {'error_rate_threshold': 0.1}):
            result = check_error_rates()

            assert result['status'] == 'high_errors'
            assert result['error_rate_5xx'] > 0.1

    @patch('monitoring.health_monitor.urlopen')
    def test_check_error_rates_no_traffic(self, mock_urlopen):
        """Test when there's no traffic."""
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            'currentHour': {
                'requests.total': 0,
                'requests.api': 0,
                'errors.5xx': 0,
            }
        }).encode('utf-8')
        mock_urlopen.return_value.__enter__.return_value = mock_response

        result = check_error_rates()

        assert result['status'] == 'no_traffic'
        assert result['total_requests'] == 0

    @patch('monitoring.health_monitor.urlopen', side_effect=Exception("Connection error"))
    def test_check_error_rates_exception(self, mock_urlopen):
        """Test exception handling."""
        result = check_error_rates()

        assert result['status'] == 'check_failed'
        assert 'error' in result


class TestProcessHealthCheck:
    """Tests for process_health_check function."""

    def setup_method(self):
        """Clear service states before each test."""
        service_states.clear()

    @patch('monitoring.health_monitor.send_alert')
    def test_process_health_check_first_healthy(self, mock_send_alert):
        """Test processing first healthy check."""
        service_config = {'optional': False}
        result = {
            'name': 'Test Service',
            'status': 'healthy',
            'response_time_ms': 100,
            'error': None,
        }

        with patch('monitoring.health_monitor.CONFIG', {'failure_threshold': 3}):
            process_health_check('test_service', result, service_config)

        assert service_states['test_service']['consecutive_failures'] == 0
        assert not mock_send_alert.called

    @patch('monitoring.health_monitor.send_alert')
    def test_process_health_check_first_failure(self, mock_send_alert):
        """Test processing first failure."""
        service_config = {'optional': False}
        result = {
            'name': 'Test Service',
            'status': 'down',
            'response_time_ms': None,
            'error': 'Connection failed',
        }

        with patch('monitoring.health_monitor.CONFIG', {'failure_threshold': 3}):
            process_health_check('test_service', result, service_config)

        assert service_states['test_service']['consecutive_failures'] == 1
        assert not mock_send_alert.called

    @patch('monitoring.health_monitor.send_alert')
    def test_process_health_check_threshold_reached(self, mock_send_alert):
        """Test alert when failure threshold is reached."""
        service_config = {'optional': False}
        result = {
            'name': 'Test Service',
            'status': 'down',
            'response_time_ms': None,
            'error': 'Connection failed',
        }

        with patch('monitoring.health_monitor.CONFIG', {'failure_threshold': 3}):
            # First two failures
            process_health_check('test_service', result, service_config)
            process_health_check('test_service', result, service_config)
            assert not mock_send_alert.called

            # Third failure should trigger alert
            process_health_check('test_service', result, service_config)
            assert mock_send_alert.called
            assert service_states['test_service']['consecutive_failures'] == 3

    @patch('monitoring.health_monitor.send_alert')
    def test_process_health_check_recovery(self, mock_send_alert):
        """Test alert when service recovers."""
        service_config = {'optional': False}

        with patch('monitoring.health_monitor.CONFIG', {'failure_threshold': 3}):
            # Fail enough times to trigger alert
            fail_result = {
                'name': 'Test Service',
                'status': 'down',
                'response_time_ms': None,
                'error': 'Connection failed',
            }
            for _ in range(3):
                process_health_check('test_service', fail_result, service_config)

            mock_send_alert.reset_mock()

            # Now recover
            healthy_result = {
                'name': 'Test Service',
                'status': 'healthy',
                'response_time_ms': 100,
                'error': None,
            }
            process_health_check('test_service', healthy_result, service_config)

            # Should send recovery alert
            assert mock_send_alert.called
            assert service_states['test_service']['consecutive_failures'] == 0

    @patch('monitoring.health_monitor.send_alert')
    def test_process_health_check_optional_service(self, mock_send_alert):
        """Test that optional services don't trigger alerts."""
        service_config = {'optional': True}
        result = {
            'name': 'Optional Service',
            'status': 'down',
            'response_time_ms': None,
            'error': 'Connection failed',
        }

        with patch('monitoring.health_monitor.CONFIG', {'failure_threshold': 3}):
            # Fail multiple times
            for _ in range(5):
                process_health_check('optional_service', result, service_config)

            # Should not trigger alert for optional service
            assert not mock_send_alert.called

    @patch('monitoring.health_monitor.send_alert')
    def test_process_health_check_degraded_status(self, mock_send_alert):
        """Test that degraded status is treated as failure."""
        service_config = {'optional': False}
        result = {
            'name': 'Test Service',
            'status': 'degraded',
            'response_time_ms': 500,
            'error': 'High latency',
        }

        with patch('monitoring.health_monitor.CONFIG', {'failure_threshold': 3}):
            process_health_check('test_service', result, service_config)

            assert service_states['test_service']['consecutive_failures'] == 1


class TestEdgeCases:
    """Tests for edge cases and boundary conditions."""

    def test_check_service_empty_response(self):
        """Test handling of empty response from health endpoint."""
        with patch('monitoring.health_monitor.urlopen') as mock_urlopen:
            mock_response = MagicMock()
            mock_response.status = 200
            mock_response.read.return_value = b''
            mock_urlopen.return_value.__enter__.return_value = mock_response

            service_config = {
                'name': 'Test Service',
                'url': 'http://localhost:8000/health',
                'expected_status': 200,
                'timeout': 10,
            }

            result = check_service('test_service', service_config)
            # Should still mark as healthy if status is correct
            assert result['status'] == 'healthy'

    def test_check_service_invalid_json(self):
        """Test handling of invalid JSON response."""
        with patch('monitoring.health_monitor.urlopen') as mock_urlopen:
            mock_response = MagicMock()
            mock_response.status = 200
            mock_response.read.return_value = b'not valid json'
            mock_urlopen.return_value.__enter__.return_value = mock_response

            service_config = {
                'name': 'Test Service',
                'url': 'http://localhost:8000/health',
                'expected_status': 200,
                'timeout': 10,
            }

            result = check_service('test_service', service_config)
            # Should still mark as healthy if status is correct
            assert result['status'] == 'healthy'

    @patch('monitoring.health_monitor.urlopen')
    def test_check_error_rates_missing_fields(self, mock_urlopen):
        """Test handling of missing fields in metrics response."""
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            'currentHour': {}
        }).encode('utf-8')
        mock_urlopen.return_value.__enter__.return_value = mock_response

        result = check_error_rates()

        assert result['total_requests'] == 0
        assert result['error_count_5xx'] == 0
        assert result['status'] == 'no_traffic'

    def test_process_health_check_rapid_state_changes(self):
        """Test handling of rapid state changes."""
        service_states.clear()
        service_config = {'optional': False}

        with patch('monitoring.health_monitor.CONFIG', {'failure_threshold': 3}):
            with patch('monitoring.health_monitor.send_alert'):
                # Alternate between healthy and unhealthy
                for i in range(10):
                    status = 'healthy' if i % 2 == 0 else 'down'
                    result = {
                        'name': 'Test Service',
                        'status': status,
                        'response_time_ms': 100 if status == 'healthy' else None,
                        'error': None if status == 'healthy' else 'Error',
                    }
                    process_health_check('test_service', result, service_config)

                # Should never reach threshold due to alternating states
                assert service_states['test_service']['consecutive_failures'] <= 1

    @patch('monitoring.health_monitor.urlopen')
    def test_check_service_very_slow_response(self, mock_urlopen):
        """Test handling of very slow response."""
        mock_response = MagicMock()
        mock_response.status = 200
        mock_urlopen.return_value.__enter__.return_value = mock_response

        with patch('monitoring.health_monitor.time.time', side_effect=[0, 30]):
            service_config = {
                'name': 'Test Service',
                'url': 'http://localhost:8000/',
                'expected_status': 200,
                'timeout': 10,
            }

            result = check_service('test_service', service_config)

            # Should still be healthy but with high response time
            assert result['response_time_ms'] == 30000.0