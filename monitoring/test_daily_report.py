import os
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

os.environ.setdefault('DATABASE_URL', 'postgresql://unused:unused@localhost:5432/unused')
import daily_report as report
import e290_report


def at(stamp):
    return datetime.fromisoformat(stamp).replace(tzinfo=timezone.utc)


class ReportTests(unittest.TestCase):
    def test_yesterday_cleanup_does_not_become_today_pdf_failure(self):
        data = {'history': [
            {'hour': '2026-09-14T20:00:00Z', 'metrics': {'keybox.withdraw_failed': 1}},
            {'hour': '2026-09-15T07:00:00Z', 'metrics': {'requests.api': 3}},
        ], 'currentHour': {}}
        counts = report.daily_metrics(data, at('2026-09-15'), at('2026-09-15T08:00:00'))
        self.assertEqual(counts.get('keybox.withdraw_failed', 0), 0)
        self.assertEqual(counts['requests.api'], 3)

    def test_current_hour_is_not_counted_twice(self):
        data = {'currentHourStart': '2026-09-15T08:00:00Z', 'currentHour': {'requests.api': 7},
                'history': [{'hour': '2026-09-15T08:00:00Z', 'metrics': {'requests.api': 5}}]}
        self.assertEqual(report.daily_metrics(data, at('2026-09-15'), at('2026-09-15T08:30:00'))['requests.api'], 7)

    def test_response_timestamp_handles_fetch_crossing_midnight(self):
        data = {'currentHourStart': '2026-09-15T23:00:00Z', 'currentHour': {'requests.api': 7}}
        self.assertEqual(report.daily_metrics(data, at('2026-09-15'), at('2026-09-16'))['requests.api'], 7)
        self.assertEqual(dict(report.daily_metrics(data, at('2026-09-16'), at('2026-09-16'))), {})

    def test_pdf_verdict_separates_cleanup_and_delivery(self):
        health = {'available': True, 'queue_available': True, 'pending': 0, 'failed': 0, 'failures': {}}
        self.assertTrue(report.pdf_verdict({'pdfs_today': 0}, {'keybox_failed': 1}, health)[0])
        self.assertFalse(report.pdf_verdict({'pdfs_today': 0}, {'delivery_keybox_unavailable': 1}, health)[0])
        self.assertFalse(report.pdf_verdict({'pdfs_today': 'N/A'}, {}, health)[0])
        self.assertFalse(report.pdf_verdict({'pdfs_today': 0}, {'error': 'offline'}, health)[0])
        self.assertFalse(report.pdf_verdict({'pdfs_today': 0}, {}, {**health, 'available': False})[0])

    def test_queue_failure_is_not_reported_as_zero(self):
        with patch.dict(os.environ, {'KEYBOX_RENDER_URL': '', 'KEYBOX_RENDER_TOKEN': ''}), patch.object(report, '_psql', return_value=None):
            health = report.get_delivery_health(at('2026-09-15'))
        self.assertFalse(health['queue_available'])
        self.assertNotIn('pending', health)

    def test_e290_snapshot_keeps_failure_and_schedule(self):
        snapshot = e290_report.snapshot({'faults': ['renderer unavailable']}, at('2026-09-15'), False,
                                        now=at('2026-09-15T18:00:01'), weather='Clear')
        self.assertEqual(snapshot['email'], 'failed')
        self.assertIn('renderer unavailable', snapshot['pages'][1])
        self.assertEqual(snapshot['expires'], int(at('2026-09-15T23:25:00').timestamp()))


if __name__ == '__main__':
    unittest.main()
