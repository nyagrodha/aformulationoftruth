"""Tests for daily_report.py: delivery/PDF health and the E290 snapshot
(production), plus the migration-017 audience buckets and ratio label
(brooch branch). stdlib-only, no database; `_psql` is mocked where needed.

Run from this directory:  python3 -m unittest test_daily_report -v
"""
import os
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

os.environ.setdefault('DATABASE_URL', 'postgresql://unused:unused@localhost:5432/unused')
import daily_report as report
import e290_report


def at(stamp):
    return datetime.fromisoformat(stamp).replace(tzinfo=timezone.utc)


def fake_psql(responses):
    """Build a `_psql` replacement keyed by a substring of the query.

    Checked in the order given, so put more specific substrings first.
    Returns None (== "query failed") for anything unmatched, matching
    `_psql`'s own behaviour on an error.
    """
    def _psql(query):
        for needle, value in responses:
            if needle in query:
                return value
        return None
    return _psql


class AudienceBucketsQueryTests(unittest.TestCase):
    """get_audience_stats: feature-detection, the pre-017 fallback, and the
    per-day cutover that keeps a migrated database from reporting a
    DEFAULT-backfilled 0 as if it were a real count.
    """

    def test_017_columns_present_and_day_is_after_the_migration(self):
        """Fixture row WITH the 017 columns: real counts, no cutover."""
        row = '10|2|3|1|55|f|6|3|0|6'
        psql = fake_psql([
            ("information_schema.columns", '2'),
            ("FROM fresh_audience_windows", row),
            ("FROM _migrations", '2026-09-01'),  # migrated well before target day
        ])
        with patch.object(report, '_psql', side_effect=psql):
            stats = report.get_audience_stats(
                datetime(2026, 9, 23, tzinfo=timezone.utc))

        self.assertTrue(stats['available'])
        self.assertTrue(stats['has_buckets'])
        self.assertIsNone(stats['buckets_cutover'])
        self.assertEqual(stats['visitors'], 10)
        self.assertEqual(stats['bot_visitors'], 2)
        self.assertEqual(stats['unclassified_visitors'], 3)
        self.assertEqual(stats['optout_navigations'], 1)
        self.assertEqual(stats['requests'], 55)

    def test_headline_and_separate_lines_render_from_017_fixture(self):
        """Rendering: headline is labelled stricter, and each bucket gets its
        own line -- none of them folded into the headline.
        """
        a = {
            'available': True, 'any_rows': True,
            'visitors': 10, 'bot_visitors': 2,
            'has_buckets': True, 'buckets_cutover': None,
            'unclassified_visitors': 3, 'optout_navigations': 1,
            'requests': 55, 'windows': 6, 'expected_windows': 6,
            'split_windows': 0, 'truncated': False,
        }
        text = "\n".join(report._audience_lines(a))
        self.assertIn("People (real page views, bots and link previews excluded)", text)
        self.assertIn("10", text)
        self.assertIn("Bots and link previews", text)
        self.assertIn("Unclassified", text)
        self.assertIn("Opted out (GPC/DNT)", text)
        self.assertIn("Route requests (app counter)", text)
        # The bucket values appear as real numbers, not as "n/a".
        self.assertNotIn("n/a", text)

    def test_row_predates_the_migration_gives_na_not_zeros(self):
        """017's columns exist, but the migration landed ON this report day
        (or later) -- pre-existing rows are DEFAULT-backfilled to 0, which
        must not be printed as a real count.
        """
        row = '5|1|0|0|20|f|1|1|0|1'
        psql = fake_psql([
            ("information_schema.columns", '2'),
            ("FROM fresh_audience_windows", row),
            ("FROM _migrations", '2026-09-23'),  # lands ON the target day
        ])
        with patch.object(report, '_psql', side_effect=psql):
            stats = report.get_audience_stats(
                datetime(2026, 9, 23, tzinfo=timezone.utc))

        self.assertTrue(stats['available'])
        self.assertTrue(stats['has_buckets'])
        self.assertEqual(stats['buckets_cutover'], '2026-09-23')
        self.assertIsNone(stats['unclassified_visitors'])
        self.assertIsNone(stats['optout_navigations'])

        lines = report._audience_lines(stats)
        text = "\n".join(lines)
        self.assertIn("n/a", text)
        self.assertIn("2026-09-23", text)
        unclassified_line = next(l for l in lines if "Unclassified" in l)
        self.assertIn("n/a", unclassified_line)
        self.assertNotIn("0", unclassified_line)

    def test_database_without_017_degrades_without_raising(self):
        """No 017 columns at all (script deployed ahead of the migration, or
        against an old checkout's database): falls back to the pre-017 query
        and still returns a usable, non-crashing result.
        """
        old_row = '7|1|40|f|6|1|0|6'
        psql = fake_psql([
            ("information_schema.columns", '0'),
            ("FROM fresh_audience_windows", old_row),
        ])
        with patch.object(report, '_psql', side_effect=psql):
            stats = report.get_audience_stats(
                datetime(2026, 9, 23, tzinfo=timezone.utc))

        self.assertTrue(stats['available'])
        self.assertFalse(stats['has_buckets'])
        self.assertIsNone(stats['unclassified_visitors'])
        self.assertIsNone(stats['optout_navigations'])
        self.assertEqual(stats['visitors'], 7)
        self.assertEqual(stats['requests'], 40)

        text = "\n".join(report._audience_lines(stats))
        self.assertIn("n/a", text)
        self.assertIn("migration 017", text)

    def test_no_row_is_still_reported_as_counter_down(self):
        """Unchanged behaviour: no row for the day at all means the counter
        was down, not that migration 017 is the issue.
        """
        psql = fake_psql([
            ("information_schema.columns", '2'),
            ("FROM fresh_audience_windows", None),
        ])
        with patch.object(report, '_psql', side_effect=psql):
            stats = report.get_audience_stats(
                datetime(2026, 9, 23, tzinfo=timezone.utc))

        self.assertEqual(stats, {'available': False})
        self.assertEqual(
            report._audience_verdict(stats), "counter unreachable")
        self.assertEqual(
            report._audience_lines(stats),
            ["  Counter unreachable: could not read fresh_audience_windows."])


class GateConversionRatioLabelTests(unittest.TestCase):
    """send_report's gate-conversion line uses the new headline figure and
    says so when the definition changed.
    """

    def _sent_telegram_message(self, summary):
        captured = {}

        def capture(msg):
            captured['msg'] = msg
            return True

        with patch.object(report, 'send_telegram_message', side_effect=capture), \
             patch.object(report, 'send_email_report', return_value=True):
            report.send_report(
                'report body', datetime(2026, 9, 23, tzinfo=timezone.utc),
                {}, summary)
        return captured['msg']

    def test_ratio_notes_the_definition_change_when_known(self):
        summary = {
            'visitors': 50, 'addresses': 10, 'windows_complete': True,
            'audience_rule_changed': '2026-09-23',
        }
        msg = self._sent_telegram_message(summary)
        self.assertIn("Gate conversion", msg)
        self.assertIn("20%", msg)
        self.assertIn("definition of 'people' changed 2026-09-23", msg)
        self.assertIn("not a trend", msg)

    def test_ratio_omits_the_note_when_change_date_unknown(self):
        summary = {
            'visitors': 50, 'addresses': 10, 'windows_complete': True,
            'audience_rule_changed': None,
        }
        msg = self._sent_telegram_message(summary)
        self.assertIn("Gate conversion", msg)
        self.assertIn("20%", msg)
        self.assertNotIn("definition of 'people' changed", msg)

    def test_ratio_still_not_computable_when_counter_incomplete(self):
        summary = {
            'visitors': 50, 'addresses': 10, 'windows_complete': False,
            'audience_rule_changed': '2026-09-23',
        }
        msg = self._sent_telegram_message(summary)
        self.assertIn("not computable", msg)


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
