"""Tests for monitoring/daily_report.py helper functions."""

import json
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import Mock, patch, MagicMock, mock_open
from collections import defaultdict

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../'))

# Mock DATABASE_URL to avoid import-time validation error
with patch.dict(os.environ, {'DATABASE_URL': 'postgresql://test:test@localhost/test'}):
    from monitoring.daily_report import (
        is_static_resource,
        send_telegram_message,
        send_email_report,
        parse_caddy_logs,
        get_metrics_stats,
        generate_report,
    )


class TestIsStaticResource:
    """Tests for is_static_resource function."""

    def test_is_static_js_file(self):
        """Test JavaScript files are recognized as static."""
        assert is_static_resource("/static/main.js") is True
        assert is_static_resource("/app.js") is True

    def test_is_static_css_file(self):
        """Test CSS files are recognized as static."""
        assert is_static_resource("/static/style.css") is True
        assert is_static_resource("/styles/main.css") is True

    def test_is_static_image_files(self):
        """Test image files are recognized as static."""
        assert is_static_resource("/images/logo.png") is True
        assert is_static_resource("/photo.jpg") is True
        assert is_static_resource("/banner.jpeg") is True
        assert is_static_resource("/icon.gif") is True
        assert is_static_resource("/graphic.svg") is True

    def test_is_static_font_files(self):
        """Test font files are recognized as static."""
        assert is_static_resource("/fonts/roboto.woff") is True
        assert is_static_resource("/fonts/arial.woff2") is True
        assert is_static_resource("/fonts/times.ttf") is True
        assert is_static_resource("/fonts/georgia.eot") is True

    def test_is_static_favicon(self):
        """Test favicon is recognized as static."""
        assert is_static_resource("/favicon.ico") is True

    def test_is_static_source_map(self):
        """Test source map files are recognized as static."""
        assert is_static_resource("/main.js.map") is True

    def test_is_not_static_html(self):
        """Test HTML pages are not static resources."""
        assert is_static_resource("/index.html") is False
        assert is_static_resource("/about.html") is False

    def test_is_not_static_api_endpoints(self):
        """Test API endpoints are not static resources."""
        assert is_static_resource("/api/users") is False
        assert is_static_resource("/api/gate") is False

    def test_is_not_static_root(self):
        """Test root path is not static."""
        assert is_static_resource("/") is False

    def test_is_static_with_query_string(self):
        """Test static detection with query strings."""
        assert is_static_resource("/main.js?v=123") is True
        assert is_static_resource("/style.css?hash=abc") is True

    def test_is_static_with_fragment(self):
        """Test static detection with fragments."""
        assert is_static_resource("/app.js#section") is True

    def test_is_static_case_insensitive(self):
        """Test that extension matching is case insensitive."""
        assert is_static_resource("/FILE.JS") is True
        assert is_static_resource("/STYLE.CSS") is True
        assert is_static_resource("/Image.PNG") is True

    def test_is_static_complex_path(self):
        """Test with complex nested paths."""
        assert is_static_resource("/static/assets/js/vendor/library.js") is True
        assert is_static_resource("/cdn/v2/images/hero.png") is True

    def test_is_not_static_path_contains_extension(self):
        """Test that paths containing but not ending with extensions work."""
        assert is_static_resource("/js/handler") is False
        assert is_static_resource("/css-reset") is False


class TestSendTelegramMessage:
    """Tests for send_telegram_message function."""

    @patch('monitoring.daily_report.CONFIG', {
        'telegram_token': 'test_token',
        'telegram_chat_id': 'test_chat_id',
    })
    @patch('monitoring.daily_report.urlopen')
    def test_send_telegram_message_success(self, mock_urlopen):
        """Test successful Telegram message sending."""
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({'ok': True}).encode('utf-8')
        mock_urlopen.return_value.__enter__.return_value = mock_response

        result = send_telegram_message("Test message")
        assert result is True

    @patch('monitoring.daily_report.CONFIG', {
        'telegram_token': 'test_token',
        'telegram_chat_id': 'test_chat_id',
    })
    @patch('monitoring.daily_report.urlopen')
    def test_send_telegram_message_api_error(self, mock_urlopen):
        """Test Telegram API returning error."""
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({'ok': False}).encode('utf-8')
        mock_urlopen.return_value.__enter__.return_value = mock_response

        result = send_telegram_message("Test message")
        assert result is False

    @patch('monitoring.daily_report.CONFIG', {
        'telegram_token': '',
        'telegram_chat_id': '',
    })
    def test_send_telegram_message_no_credentials(self):
        """Test that missing credentials returns False."""
        result = send_telegram_message("Test message")
        assert result is False

    @patch('monitoring.daily_report.CONFIG', {
        'telegram_token': 'test_token',
        'telegram_chat_id': 'test_chat_id',
    })
    @patch('monitoring.daily_report.urlopen', side_effect=Exception("Network error"))
    def test_send_telegram_message_exception(self, mock_urlopen):
        """Test exception handling."""
        result = send_telegram_message("Test message")
        assert result is False


class TestSendEmailReport:
    """Tests for send_email_report function."""

    @patch('monitoring.daily_report.CONFIG', {
        'sendgrid_api_key': 'test_api_key',
        'report_email': 'test@example.com',
        'from_email': 'sender@example.com',
    })
    @patch('monitoring.daily_report.urlopen')
    def test_send_email_report_success(self, mock_urlopen):
        """Test successful email sending."""
        mock_response = MagicMock()
        mock_response.status = 202
        mock_urlopen.return_value.__enter__.return_value = mock_response

        result = send_email_report("Test Subject", "Test Body")
        assert result is True

    @patch('monitoring.daily_report.CONFIG', {
        'sendgrid_api_key': 'test_api_key',
        'report_email': 'test@example.com',
        'from_email': 'sender@example.com',
    })
    @patch('monitoring.daily_report.urlopen')
    def test_send_email_report_200_status(self, mock_urlopen):
        """Test email sending with 200 status."""
        mock_response = MagicMock()
        mock_response.status = 200
        mock_urlopen.return_value.__enter__.return_value = mock_response

        result = send_email_report("Test Subject", "Test Body")
        assert result is True

    @patch('monitoring.daily_report.CONFIG', {
        'sendgrid_api_key': '',
    })
    def test_send_email_report_no_api_key(self):
        """Test that missing API key returns False."""
        result = send_email_report("Test Subject", "Test Body")
        assert result is False

    @patch('monitoring.daily_report.CONFIG', {
        'sendgrid_api_key': 'test_api_key',
        'report_email': 'test@example.com',
        'from_email': 'sender@example.com',
    })
    @patch('monitoring.daily_report.urlopen', side_effect=Exception("API error"))
    def test_send_email_report_exception(self, mock_urlopen):
        """Test exception handling."""
        result = send_email_report("Test Subject", "Test Body")
        assert result is False


class TestParseCaddyLogs:
    """Tests for parse_caddy_logs function."""

    @patch('monitoring.daily_report.CONFIG', {'caddy_log_path': '/var/log/caddy/access.log'})
    @patch('monitoring.daily_report.Path')
    def test_parse_caddy_logs_file_not_found(self, mock_path):
        """Test handling of missing log file."""
        mock_path.return_value.exists.return_value = False

        target_date = datetime(2024, 1, 1, tzinfo=timezone.utc)
        result = parse_caddy_logs(target_date)

        assert result['error'] == 'Log file not found'
        assert result['unique_visitors'] == 0

    @patch('monitoring.daily_report.CONFIG', {'caddy_log_path': '/test/access.log'})
    @patch('monitoring.daily_report.Path')
    @patch('builtins.open', new_callable=mock_open)
    def test_parse_caddy_logs_valid_entries(self, mock_file, mock_path):
        """Test parsing valid log entries."""
        mock_path.return_value.exists.return_value = True
        mock_path.return_value.suffix = ''

        target_date = datetime(2024, 1, 1, tzinfo=timezone.utc)
        log_entries = [
            json.dumps({
                'ts': target_date.timestamp(),
                'request': {'uri': '/api/test', 'method': 'GET', 'client_ip': '1.2.3.4'},
                'status': 200
            }),
            json.dumps({
                'ts': target_date.timestamp(),
                'request': {'uri': '/page', 'method': 'GET', 'client_ip': '5.6.7.8'},
                'status': 200
            }),
        ]
        mock_file.return_value.__enter__.return_value = log_entries

        result = parse_caddy_logs(target_date)

        assert result['unique_visitors'] == 2
        assert result['total_requests'] == 2
        assert result['api_requests'] == 1

    @patch('monitoring.daily_report.CONFIG', {'caddy_log_path': '/test/access.log'})
    @patch('monitoring.daily_report.Path')
    @patch('builtins.open', new_callable=mock_open)
    def test_parse_caddy_logs_filters_static_resources(self, mock_file, mock_path):
        """Test that static resources are filtered from page views."""
        mock_path.return_value.exists.return_value = True
        mock_path.return_value.suffix = ''

        target_date = datetime(2024, 1, 1, tzinfo=timezone.utc)
        log_entries = [
            json.dumps({
                'ts': target_date.timestamp(),
                'request': {'uri': '/main.js', 'method': 'GET', 'client_ip': '1.2.3.4'},
                'status': 200
            }),
            json.dumps({
                'ts': target_date.timestamp(),
                'request': {'uri': '/page', 'method': 'GET', 'client_ip': '1.2.3.4'},
                'status': 200
            }),
        ]
        mock_file.return_value.__enter__.return_value = log_entries

        result = parse_caddy_logs(target_date)

        assert result['total_requests'] == 2
        assert result['page_views'] == 1  # Only non-static

    @patch('monitoring.daily_report.CONFIG', {'caddy_log_path': '/test/access.log'})
    @patch('monitoring.daily_report.Path')
    @patch('builtins.open', new_callable=mock_open)
    def test_parse_caddy_logs_counts_errors(self, mock_file, mock_path):
        """Test that errors are counted correctly."""
        mock_path.return_value.exists.return_value = True
        mock_path.return_value.suffix = ''

        target_date = datetime(2024, 1, 1, tzinfo=timezone.utc)
        log_entries = [
            json.dumps({
                'ts': target_date.timestamp(),
                'request': {'uri': '/page', 'method': 'GET', 'client_ip': '1.2.3.4'},
                'status': 404
            }),
            json.dumps({
                'ts': target_date.timestamp(),
                'request': {'uri': '/page', 'method': 'GET', 'client_ip': '1.2.3.4'},
                'status': 500
            }),
        ]
        mock_file.return_value.__enter__.return_value = log_entries

        result = parse_caddy_logs(target_date)

        assert result['errors_4xx'] == 1
        assert result['errors_5xx'] == 1

    @patch('monitoring.daily_report.CONFIG', {'caddy_log_path': '/test/access.log'})
    @patch('monitoring.daily_report.Path')
    @patch('builtins.open', new_callable=mock_open)
    def test_parse_caddy_logs_tracks_hourly_traffic(self, mock_file, mock_path):
        """Test hourly traffic tracking."""
        mock_path.return_value.exists.return_value = True
        mock_path.return_value.suffix = ''

        target_date = datetime(2024, 1, 1, 12, 30, tzinfo=timezone.utc)
        log_entries = [
            json.dumps({
                'ts': target_date.timestamp(),
                'request': {'uri': '/page', 'method': 'GET', 'client_ip': '1.2.3.4'},
                'status': 200
            }),
        ]
        mock_file.return_value.__enter__.return_value = log_entries

        result = parse_caddy_logs(target_date)

        assert 12 in result['hourly_traffic']
        assert result['hourly_traffic'][12] == 1


class TestGetMetricsStats:
    """Tests for get_metrics_stats function."""

    @patch('monitoring.daily_report.urlopen')
    def test_get_metrics_stats_success(self, mock_urlopen):
        """Test successful metrics retrieval."""
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            'currentHour': {
                'requests.total': 100,
                'requests.api': 50,
                'auth.magiclink.sent': 10,
            },
            'history': []
        }).encode('utf-8')
        mock_urlopen.return_value.__enter__.return_value = mock_response

        result = get_metrics_stats()

        assert result['total_requests'] == 150
        assert result['api_requests'] == 50
        assert result['magic_links_sent'] == 10

    @patch('monitoring.daily_report.urlopen', side_effect=Exception("Connection error"))
    def test_get_metrics_stats_exception(self, mock_urlopen):
        """Test exception handling."""
        result = get_metrics_stats()
        assert result['error'] is not None

    @patch('monitoring.daily_report.urlopen')
    def test_get_metrics_stats_with_history(self, mock_urlopen):
        """Test metrics aggregation with history."""
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({
            'currentHour': {
                'requests.total': 100,
            },
            'history': [
                {'metrics': {'requests.total': 50}},
                {'metrics': {'requests.total': 75}},
            ]
        }).encode('utf-8')
        mock_urlopen.return_value.__enter__.return_value = mock_response

        result = get_metrics_stats()

        # Should sum current + history
        assert result['total_requests'] >= 100


class TestGenerateReport:
    """Tests for generate_report function."""

    @patch('monitoring.daily_report.parse_caddy_logs')
    @patch('monitoring.daily_report.get_metrics_stats')
    @patch('monitoring.daily_report.get_newsletter_stats')
    def test_generate_report_basic_structure(self, mock_newsletter, mock_metrics, mock_caddy):
        """Test that report has correct structure."""
        mock_caddy.return_value = {
            'unique_visitors': 100,
            'total_requests': 500,
            'page_views': 300,
            'api_requests': 50,
            'errors_4xx': 10,
            'errors_5xx': 2,
            'top_paths': {},
            'hourly_traffic': {},
        }
        mock_metrics.return_value = {
            'magic_links_sent': 20,
            'magic_links_verified': 15,
            'questionnaires_started': 10,
            'questionnaires_completed': 8,
            'questions_answered': 80,
            'funnel': {},
            'latency': {},
            'features': {},
        }
        mock_newsletter.return_value = {
            'total_subscribers': 1000,
            'confirmed_subscribers': 900,
            'pending_subscribers': 100,
            'new_signups_today': 5,
            'new_confirmed_today': 4,
            'legacy_count': 50,
        }

        target_date = datetime(2024, 1, 1, tzinfo=timezone.utc)
        report = generate_report(target_date)

        assert "Daily Visitor Report - 2024-01-01" in report
        assert "VISITOR STATISTICS" in report
        assert "NEWSLETTER SUBSCRIBERS" in report
        assert "QUESTIONNAIRE ACTIVITY" in report
        assert "100" in report  # unique visitors

    @patch('monitoring.daily_report.parse_caddy_logs')
    @patch('monitoring.daily_report.get_metrics_stats')
    @patch('monitoring.daily_report.get_newsletter_stats')
    def test_generate_report_includes_funnel(self, mock_newsletter, mock_metrics, mock_caddy):
        """Test that funnel metrics are included when available."""
        mock_caddy.return_value = {'unique_visitors': 0, 'total_requests': 0, 'page_views': 0,
                                   'api_requests': 0, 'errors_4xx': 0, 'errors_5xx': 0,
                                   'top_paths': {}, 'hourly_traffic': {}}
        mock_metrics.return_value = {
            'funnel': {
                'gate_viewed': 100,
                'gate_q1': 80,
                'gate_q2': 70,
                'email_entered': 60,
                'completion_viewed': 50,
            },
            'latency': {},
            'features': {},
        }
        mock_newsletter.return_value = {'total_subscribers': 0, 'confirmed_subscribers': 0,
                                       'pending_subscribers': 0, 'new_signups_today': 0,
                                       'new_confirmed_today': 0, 'legacy_count': 0}

        report = generate_report()

        assert "CONVERSION FUNNEL" in report
        assert "Gate Viewed" in report

    @patch('monitoring.daily_report.parse_caddy_logs')
    @patch('monitoring.daily_report.get_metrics_stats')
    @patch('monitoring.daily_report.get_newsletter_stats')
    def test_generate_report_default_date(self, mock_newsletter, mock_metrics, mock_caddy):
        """Test that default date is yesterday."""
        mock_caddy.return_value = {'unique_visitors': 0, 'total_requests': 0, 'page_views': 0,
                                   'api_requests': 0, 'errors_4xx': 0, 'errors_5xx': 0,
                                   'top_paths': {}, 'hourly_traffic': {}}
        mock_metrics.return_value = {'funnel': {}, 'latency': {}, 'features': {}}
        mock_newsletter.return_value = {'total_subscribers': 0, 'confirmed_subscribers': 0,
                                       'pending_subscribers': 0, 'new_signups_today': 0,
                                       'new_confirmed_today': 0, 'legacy_count': 0}

        report = generate_report()

        yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime('%Y-%m-%d')
        assert yesterday in report


class TestEdgeCases:
    """Tests for edge cases and error handling."""

    def test_is_static_resource_empty_path(self):
        """Test handling of empty path."""
        assert is_static_resource("") is False

    def test_is_static_resource_just_extension(self):
        """Test handling of just an extension."""
        assert is_static_resource(".js") is True

    @patch('monitoring.daily_report.CONFIG', {'caddy_log_path': '/test/access.log'})
    @patch('monitoring.daily_report.Path')
    @patch('builtins.open', new_callable=mock_open)
    def test_parse_caddy_logs_malformed_json(self, mock_file, mock_path):
        """Test handling of malformed JSON entries."""
        mock_path.return_value.exists.return_value = True
        mock_path.return_value.suffix = ''

        target_date = datetime(2024, 1, 1, tzinfo=timezone.utc)
        log_entries = [
            "not valid json",
            json.dumps({
                'ts': target_date.timestamp(),
                'request': {'uri': '/page', 'method': 'GET', 'client_ip': '1.2.3.4'},
                'status': 200
            }),
        ]
        mock_file.return_value.__enter__.return_value = log_entries

        result = parse_caddy_logs(target_date)

        # Should skip malformed entry but process valid one
        assert result['total_requests'] == 1

    @patch('monitoring.daily_report.CONFIG', {'caddy_log_path': '/test/access.log'})
    @patch('monitoring.daily_report.Path')
    @patch('builtins.open', new_callable=mock_open)
    def test_parse_caddy_logs_wrong_date(self, mock_file, mock_path):
        """Test that entries from wrong date are skipped."""
        mock_path.return_value.exists.return_value = True
        mock_path.return_value.suffix = ''

        target_date = datetime(2024, 1, 1, tzinfo=timezone.utc)
        wrong_date = datetime(2024, 1, 2, tzinfo=timezone.utc)
        log_entries = [
            json.dumps({
                'ts': wrong_date.timestamp(),
                'request': {'uri': '/page', 'method': 'GET', 'client_ip': '1.2.3.4'},
                'status': 200
            }),
        ]
        mock_file.return_value.__enter__.return_value = log_entries

        result = parse_caddy_logs(target_date)

        assert result['total_requests'] == 0