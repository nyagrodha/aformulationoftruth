#!/usr/bin/env python3
"""
Daily Visitor Report for A Formulation of Truth

Generates daily visitor statistics from:
1. Caddy access logs (primary source)
2. /api/metrics endpoint (secondary/cross-reference)

Sends report via Email (SMTP) and Telegram.

Privacy: Aggregates counts only. No individual IP addresses, user agents, or PII are logged or reported.
Logs are read and discarded - not stored beyond this script's execution.

Environment Variables Required:
- TELEGRAM_BOT_TOKEN: Telegram bot API token
- TELEGRAM_CHAT_ID: Chat ID to send reports to
- REPORT_EMAIL: Email address to receive reports
- SMTP_HOST / SMTP_PORT / SMTP_SECURE / SMTP_USER / SMTP_PASS: mail transport,
  shared with the site's own magic-link sender
- FROM_EMAIL: Sender address (defaults to SMTP_USER)
"""

import os
import sys
import json
import gzip
import re
import logging
import subprocess
import smtplib
from email.message import EmailMessage
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Dict, Any, List, Optional, Set
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
from urllib.parse import urlencode
from collections import defaultdict

# Configure logging - aggregate metrics only, no PII
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

# Configuration from environment
# NOTE: DATABASE_URL is required — no default to avoid hardcoded credentials
CONFIG = {
    'telegram_token': os.environ.get('TELEGRAM_BOT_TOKEN', ''),
    'telegram_chat_id': os.environ.get('TELEGRAM_CHAT_ID', ''),
    # No hardcoded fallback: a recipient address baked into a tracked file
    # would live in git history forever, and this repository's whole posture
    # is that addresses do not get written down. a4t-report.service supplies
    # REPORT_EMAIL via its drop-in; unset means the email channel is skipped
    # and said so, rather than silently mailing a default.
    'report_email': os.environ.get('REPORT_EMAIL', os.environ.get('ALERT_EMAIL', '')),
    # SMTP, reusing the credentials the site already sends magic links with.
    # SendGrid was a second mail provider, a second API key and a second thing
    # to notice had broken; the site's own transport is already configured,
    # already authenticated, and already the one whose deliverability matters.
    'smtp_host': os.environ.get('SMTP_HOST', ''),
    'smtp_port': int(os.environ.get('SMTP_PORT', '587')),
    'smtp_secure': os.environ.get('SMTP_SECURE', 'false').lower() == 'true',
    'smtp_user': os.environ.get('SMTP_USER', ''),
    'smtp_pass': os.environ.get('SMTP_PASS', ''),
    'from_email': os.environ.get('FROM_EMAIL', os.environ.get('SMTP_USER', '')),
    'caddy_log_path': os.environ.get('CADDY_LOG_PATH', '/var/log/caddy/access.log'),
    # 8393 was hardcoded here and has been dead for as long as the app has
    # listened on PORT (7268). The fetch failed on every run, was caught, and
    # the metrics sections silently reported nothing.
    'metrics_url': os.environ.get(
        'METRICS_URL',
        f"http://127.0.0.1:{os.environ.get('PORT', '7268')}/api/metrics",
    ),
    'database_url': os.environ.get('DATABASE_URL', ''),
}

# Validate required configuration at import time
if not CONFIG['database_url']:
    raise EnvironmentError(
        "DATABASE_URL environment variable is required but not set. "
        "Please set DATABASE_URL to a valid PostgreSQL connection string."
    )

# Which vhosts this report is about. The access log is shared by every site on
# the box, so without this the traffic numbers are a meaningless sum.
REPORT_HOSTS = {
    h.strip().lower()
    for h in os.environ.get(
        'REPORT_HOSTS',
        'aformulationoftruth.com,www.aformulationoftruth.com,app.aformulationoftruth.com',
    ).split(',')
    if h.strip()
}

# Static resources to exclude from visitor counts
STATIC_EXTENSIONS = {'.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.map'}


def send_telegram_message(message: str) -> bool:
    """Send message via Telegram bot."""
    if not CONFIG['telegram_token'] or not CONFIG['telegram_chat_id']:
        logger.warning("Telegram credentials not configured")
        return False

    try:
        url = f"https://api.telegram.org/bot{CONFIG['telegram_token']}/sendMessage"
        data = urlencode({
            'chat_id': CONFIG['telegram_chat_id'],
            'text': message,
            'parse_mode': 'HTML'
        }).encode('utf-8')

        req = Request(url, data=data, method='POST')
        req.add_header('Content-Type', 'application/x-www-form-urlencoded')

        with urlopen(req, timeout=10) as response:
            result = json.loads(response.read().decode('utf-8'))
            return result.get('ok', False)
    except Exception:
        logger.exception("Failed to send Telegram message")
        return False


def send_email_report(subject: str, body: str) -> bool:
    """Send the report over SMTP.

    Uses the same authenticated submission the site uses for magic links, so
    there is one mail path to configure and one to watch. Nothing here is
    sensitive -- the report carries aggregate counts only -- but it goes out
    over STARTTLS regardless, because the credentials are.
    """
    if not CONFIG['smtp_host'] or not CONFIG['smtp_user'] or not CONFIG['smtp_pass']:
        logger.warning("SMTP not configured; skipping email report")
        return False

    # Checked separately from the SMTP triple so the log says which half is
    # missing. The recipient has no hardcoded default by design, so an
    # unconfigured REPORT_EMAIL must be a loud skip, never a send to ''.
    if not CONFIG['report_email']:
        logger.warning("REPORT_EMAIL not set; skipping email report")
        return False

    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = f"A Formulation of Truth Reports <{CONFIG['from_email']}>"
    msg['To'] = CONFIG['report_email']
    msg.set_content(body)

    try:
        if CONFIG['smtp_secure']:
            # Implicit TLS, port 465.
            with smtplib.SMTP_SSL(CONFIG['smtp_host'], CONFIG['smtp_port'], timeout=30) as smtp:
                smtp.login(CONFIG['smtp_user'], CONFIG['smtp_pass'])
                smtp.send_message(msg)
        else:
            # STARTTLS, port 587 -- Apple's submission default.
            with smtplib.SMTP(CONFIG['smtp_host'], CONFIG['smtp_port'], timeout=30) as smtp:
                smtp.starttls()
                smtp.login(CONFIG['smtp_user'], CONFIG['smtp_pass'])
                smtp.send_message(msg)
        return True
    except Exception as exc:
        # The MESSAGE is withheld deliberately -- an SMTP exception can echo the
        # envelope, and the recipient address is the one piece of PII here. The
        # exception CLASS carries no such risk and is the difference between a
        # diagnosable failure and a silent one.
        logger.error("Failed to send email report over SMTP (%s)", type(exc).__name__)
        return False


def is_static_resource(path: str) -> bool:
    """Check if path is a static resource.

    Strips query strings and fragments before checking extension,
    so cache-busted URLs like /main.js?v=123 are correctly classified.
    """
    # Strip query string and fragment before checking extension
    clean_path = path.split('?')[0].split('#')[0]
    path_lower = clean_path.lower()
    return any(path_lower.endswith(ext) for ext in STATIC_EXTENSIONS)


def get_newsletter_stats(target_date: datetime) -> Dict[str, Any]:
    """
    Get newsletter subscription stats from database.

    Returns aggregate counts only - no email addresses or PII.
    Queries the unified table (primary) plus legacy tables for historical data.
    """
    stats = {
        'total_subscribers': 0,
        'confirmed_subscribers': 0,
        'pending_subscribers': 0,
        'new_signups_today': 0,
        'new_confirmed_today': 0,
        'legacy_count': 0,  # From old tables
        'error': None,
    }

    try:
        date_str = target_date.strftime('%Y-%m-%d')

        # Parse database URL
        db_url = CONFIG['database_url']
        # Extract components: postgresql://user:pass@host:port/db
        match = re.match(r'postgresql://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)', db_url)
        if not match:
            stats['error'] = 'Invalid database URL'
            return stats

        user, password, host, port, database = match.groups()

        # Query for stats from unified table (aggregate counts only, no PII)
        # CORRECTED 2026-08-13. These queried newsletter_unified and
        # newsletter_emails, neither of which exists on production -- every one
        # errored, and each is wrapped in `except Exception: pass`, so the
        # report showed zeros that read exactly like "nobody subscribed". The
        # tables that exist are fresh_newsletter and newsletter_subscribers.
        queries = {
            'total': "SELECT COUNT(*) FROM fresh_newsletter",
            'confirmed': "SELECT COUNT(*) FROM fresh_newsletter WHERE status = 'confirmed'",
            'pending': "SELECT COUNT(*) FROM fresh_newsletter WHERE status = 'pending'",
            'new_today': f"SELECT COUNT(*) FROM fresh_newsletter WHERE created_at::date = '{date_str}'",
            'confirmed_today': f"SELECT COUNT(*) FROM fresh_newsletter WHERE confirmed_at::date = '{date_str}'",
            'legacy': "SELECT COUNT(*) FROM newsletter_subscribers WHERE unsubscribed_at IS NULL",
        }

        env = os.environ.copy()
        env['PGPASSWORD'] = password

        for key, query in queries.items():
            try:
                result = subprocess.run(
                    ['psql', '-h', host, '-p', port, '-U', user, '-d', database, '-t', '-c', query],
                    capture_output=True,
                    text=True,
                    env=env,
                    timeout=10
                )
                if result.returncode == 0:
                    count = int(result.stdout.strip() or 0)
                    if key == 'total':
                        stats['total_subscribers'] = count
                    elif key == 'confirmed':
                        stats['confirmed_subscribers'] = count
                    elif key == 'pending':
                        stats['pending_subscribers'] = count
                    elif key == 'new_today':
                        stats['new_signups_today'] = count
                    elif key == 'confirmed_today':
                        stats['new_confirmed_today'] = count
                    elif key == 'legacy':
                        stats['legacy_count'] = count
            except subprocess.TimeoutExpired:
                raise  # Re-raise to be caught by outer handler
            except Exception:
                pass  # Other individual query failures shouldn't stop the report

    except subprocess.TimeoutExpired:
        stats['error'] = 'Database query timeout'
    except Exception as e:
        stats['error'] = str(e)
        logger.exception("Error fetching newsletter stats")

    return stats


def _psql(query: str) -> Optional[str]:
    """Run one read-only query, returning the trimmed scalar or None.

    Shells out to psql the same way get_newsletter_stats does, so this script
    keeps its single dependency-free posture (no psycopg2 to install on the
    box).
    """
    db_url = CONFIG['database_url']
    match = re.match(r'postgresql://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)', db_url)
    if not match:
        return None
    user, password, host, port, database = match.groups()
    env = os.environ.copy()
    env['PGPASSWORD'] = password
    try:
        r = subprocess.run(
            ['psql', '-h', host, '-p', port, '-U', user, '-d', database, '-t', '-A', '-c', query],
            capture_output=True, text=True, env=env, timeout=15,
        )
        return r.stdout.strip() if r.returncode == 0 else None
    except Exception:
        return None


def get_questionnaire_stats(target_date: datetime) -> Dict[str, Any]:
    """Gate submissions, completions and PDF deliveries, from the database.

    Counted from the tables rather than the in-process /api/metrics counters,
    which reset whenever the service restarts and therefore cannot answer
    "how many today" across a deploy.

    Aggregates only. No address, no hash, no answer text leaves this function.
    """
    d = target_date.strftime('%Y-%m-%d')
    stats: Dict[str, Any] = {
        'gate_submissions_today': 'N/A', 'gate_submissions_total': 'N/A',
        'completions_today': 'N/A', 'completions_total': 'N/A',
        'sessions_started_today': 'N/A',
        'pdfs_today': 'N/A', 'pdfs_total': 'N/A', 'pdf_note': None,
    }

    # A gate submission is one person handing over an address, so this is the
    # "new emails in the database" count -- though only the SHA-256 hash and an
    # age-encrypted copy are ever stored.
    v = _psql(f"SELECT COUNT(*) FILTER (WHERE created_at::date = '{d}'), COUNT(*) FROM fresh_gate_responses")
    if v and '|' in v:
        stats['gate_submissions_today'], stats['gate_submissions_total'] = (int(x) for x in v.split('|'))

    v = _psql(
        "SELECT COUNT(*) FILTER (WHERE completed_at::date = '" + d + "'), "
        "COUNT(*) FILTER (WHERE completed_at IS NOT NULL), "
        "COUNT(*) FILTER (WHERE created_at::date = '" + d + "') FROM fresh_questionnaire_sessions"
    )
    if v and v.count('|') == 2:
        a, b, c = (int(x) for x in v.split('|'))
        stats['completions_today'], stats['completions_total'], stats['sessions_started_today'] = a, b, c

    # pdf_delivered_at arrives with migration 010. Until that is applied the
    # column is absent, and asking for it would error -- so check first and say
    # plainly that delivery is not deployed rather than reporting a silent zero,
    # which would read exactly like "deployed, nobody wanted one".
    has_col = _psql(
        "SELECT COUNT(*) FROM information_schema.columns "
        "WHERE table_name='fresh_gate_responses' AND column_name='pdf_delivered_at'"
    )
    if has_col == '1':
        v = _psql(
            f"SELECT COUNT(*) FILTER (WHERE pdf_delivered_at::date = '{d}'), "
            "COUNT(*) FILTER (WHERE pdf_delivered_at IS NOT NULL) FROM fresh_gate_responses"
        )
        if v and '|' in v:
            stats['pdfs_today'], stats['pdfs_total'] = (int(x) for x in v.split('|'))
    else:
        stats['pdf_note'] = 'delivery not deployed (migration 010 pending)'

    return stats


# ── run history: deltas between reports, and rolling averages ───────────────
#
# Three reports a day means each should say what changed since the LAST one,
# not merely restate cumulative totals -- otherwise the 6pm and 11:15pm mails
# are near-copies of the 8am one and stop being read. Each run appends its
# counters here and reports the difference from the previous run.
#
# Aggregate counts only. No addresses, no hashes, no paths.
HISTORY_PATH = os.environ.get('REPORT_HISTORY', '/var/lib/a4t-reports/history.jsonl')


def load_history(limit: int = 200) -> list:
    """Recent runs, oldest first. Missing or corrupt lines are skipped."""
    try:
        with open(HISTORY_PATH) as fh:
            lines = fh.readlines()[-limit:]
    except FileNotFoundError:
        return []
    except Exception:
        logger.warning("history unreadable; continuing without deltas")
        return []

    out = []
    for line in lines:
        try:
            out.append(json.loads(line))
        except Exception:
            continue  # one bad line must not blind the whole report
    return out


def append_history(entry: Dict[str, Any]) -> None:
    try:
        Path(HISTORY_PATH).parent.mkdir(parents=True, exist_ok=True)
        with open(HISTORY_PATH, 'a') as fh:
            fh.write(json.dumps(entry, sort_keys=True) + '\n')
    except Exception:
        # A report that cannot record itself is still worth sending.
        logger.warning("could not append to history")


def _num(v: Any) -> Optional[float]:
    return float(v) if isinstance(v, (int, float)) else None


def delta_line(label: str, current: Any, previous: Any, width: int = 8) -> str:
    """One row: value now, and the change since the previous report."""
    cur = _num(current)
    if cur is None:
        return f"  {label:<20}{str(current):>{width}}"
    prev = _num(previous)
    if prev is None:
        return f"  {label:<20}{current:>{width}}   (first report)"
    d = cur - prev
    arrow = '+' if d > 0 else ('' if d == 0 else '')
    return f"  {label:<20}{current:>{width}}   ({arrow}{d:g} since last report)"


def _fmt_avg(v: Optional[float]) -> str:
    """A mean, or a word saying we do not have one yet.

    Two runs are needed before a per-report change exists at all, so early
    reports say "building" rather than printing 0.0 -- which would read as
    "nothing is happening" instead of "not enough data yet".
    """
    return f"{v:.1f}" if v is not None else "building"


def averages(hist: list, keys: list) -> Dict[str, Optional[float]]:
    """Mean per-report change across history, per key.

    Deliberately averages the DIFFERENCES rather than the totals: the totals
    only ever climb, so their mean says nothing about the rate of anything.
    """
    out: Dict[str, Optional[float]] = {}
    for k in keys:
        vals = [_num(h.get(k)) for h in hist]
        vals = [v for v in vals if v is not None]
        diffs = [b - a for a, b in zip(vals, vals[1:]) if b >= a]
        out[k] = (sum(diffs) / len(diffs)) if diffs else None
    return out


def _visitor_lines(a: Dict[str, Any]) -> List[str]:
    """Visitor lines, or a fault. A silent 0 is how the old dead counter hid."""
    if not a.get('available') or a.get('windows', 0) == 0:
        return ["  RECORDER NOT RUNNING - no windows recorded (expect 6/day)"]
    lines = [
        f"  Visitors (upper bound): {a['visitors']:>4}",
        f"  Link previews:          {a['bot_visitors']:>4}",
        f"  Windows:                {a['windows']:>4}",
    ]
    if a.get('truncated'):
        lines.append("  NOTE: a window hit its cap; the figure is a floor.")
    return lines


def get_audience_stats(target_date: datetime) -> Dict[str, Any]:
    """Visitor counts from the app-side counter (fresh_audience_windows)."""
    day = target_date.strftime('%Y-%m-%d')
    row = _psql(
        "SELECT COALESCE(SUM(visitors),0), COALESCE(SUM(bot_visitors),0), "
        "COALESCE(SUM(requests),0), COALESCE(BOOL_OR(truncated),false), COUNT(*) "
        "FROM fresh_audience_windows WHERE site='a4t' "
        f"AND window_start >= '{day}T00:00:00+00' AND window_start < '{day}T00:00:00+00'::timestamptz + interval '1 day'"
    )
    if not row:
        return {'available': False}
    v, b, r, trunc, windows = (row.split('|') + [''] * 5)[:5]
    return {
        'available': True,
        'visitors': int(v or 0),
        'bot_visitors': int(b or 0),
        'requests': int(r or 0),
        'truncated': (trunc or 'f') == 't',
        'windows': int(windows or 0),
    }


def parse_caddy_logs(target_date: datetime) -> Dict[str, Any]:
    """
    Parse Caddy JSON access logs for the target date.

    Returns aggregate counts only - no individual request data stored.
    IPs are immediately hashed for unique visitor counting, then discarded.
    """
    stats = {
        # No 'unique_visitors' here. It used to live in this dict and was always
        # 0: it was derived from request>client_ip, which the Caddyfile deletes
        # before the line is written. Visitor counts now come from the app-side
        # counter -- see get_audience_stats.
        'total_requests': 0,
        'page_views': 0,
        'api_requests': 0,
        'questionnaire_starts': 0,
        'gate_submissions': 0,
        'errors_4xx': 0,
        'errors_5xx': 0,
        'top_paths': defaultdict(int),
        'hourly_traffic': defaultdict(int),
        # Reported rather than silently dropped: a wrong allowlist should show
        # up as a visible number, not as traffic that quietly vanished.
        'other_host_requests': 0,
        'source': 'caddy_logs',
    }

    log_path = Path(CONFIG['caddy_log_path'])
    if not log_path.exists():
        logger.warning(f"Caddy log file not found: {log_path}")
        stats['error'] = 'Log file not found'
        return stats

    target_date_str = target_date.strftime('%Y-%m-%d')

    try:
        # Try reading as plain text first, then gzipped
        if log_path.suffix == '.gz':
            open_func = lambda p: gzip.open(p, 'rt', encoding='utf-8')
        else:
            open_func = lambda p: open(p, 'r', encoding='utf-8')

        with open_func(log_path) as f:
            for line in f:
                try:
                    entry = json.loads(line.strip())

                    # Get timestamp and filter by date
                    ts = entry.get('ts', 0)
                    if ts:
                        entry_date = datetime.fromtimestamp(ts, tz=timezone.utc)
                        if entry_date.strftime('%Y-%m-%d') != target_date_str:
                            continue

                        # Count hourly traffic
                        hour = entry_date.hour
                        stats['hourly_traffic'][hour] += 1

                    request = entry.get('request', {})

                    # One access.log carries every vhost -- fobdongle.com,
                    # gimbal, proust, terra, the VPN panel. Without this filter
                    # every number below is a sum across unrelated sites, which
                    # is what it silently was until 2026-08-19. request>host
                    # survives the Caddy filter, so no proxy change is needed.
                    host = (request.get('host') or '').split(':')[0].lower()
                    if host not in REPORT_HOSTS:
                        stats['other_host_requests'] += 1
                        continue

                    uri = request.get('uri', '')
                    method = request.get('method', '')
                    status = entry.get('status', 0)

                    # Skip static resources for page view counting
                    is_static = is_static_resource(uri)

                    stats['total_requests'] += 1

                    if not is_static:
                        stats['page_views'] += 1

                    # Categorize requests
                    if uri.startswith('/api/'):
                        stats['api_requests'] += 1
                        # Count gate submissions from both old (/gate-submit) and new (/api/gate) endpoints
                        if method == 'POST' and ('/gate-submit' in uri or '/api/gate' in uri):
                            stats['gate_submissions'] += 1
                        if '/questions/next' in uri:
                            stats['questionnaire_starts'] += 1

                    # Count errors
                    if 400 <= status < 500:
                        stats['errors_4xx'] += 1
                    elif status >= 500:
                        stats['errors_5xx'] += 1

                    # Track top paths (non-static only)
                    if not is_static:
                        # Normalize path (remove query params, truncate)
                        clean_path = uri.split('?')[0][:50]
                        stats['top_paths'][clean_path] += 1

                except json.JSONDecodeError:
                    continue  # Skip malformed lines
                except Exception:
                    continue  # Skip problematic entries

        # Convert top_paths to sorted list
        stats['top_paths'] = dict(sorted(
            stats['top_paths'].items(),
            key=lambda x: x[1],
            reverse=True
        )[:10])

    except Exception as e:
        logger.exception("Error parsing Caddy logs")
        stats['error'] = str(e)

    return stats


def get_metrics_stats() -> Dict[str, Any]:
    """Get stats from /api/metrics endpoint."""
    stats = {
        'source': 'api_metrics',
        'error': None,
    }

    try:
        req = Request(CONFIG['metrics_url'], method='GET')
        with urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode('utf-8'))

            # Sum up historical hours for the day
            current = data.get('currentHour', {})
            history = data.get('history', [])

            # Aggregate from history (last 24 hours)
            totals = defaultdict(int)
            for hour_data in history[-24:]:
                metrics = hour_data.get('metrics', {})
                for key, value in metrics.items():
                    if isinstance(value, (int, float)):
                        totals[key] += value

            # Add current hour
            for key, value in current.items():
                if isinstance(value, (int, float)):
                    totals[key] += value

            # Core metrics
            stats.update({
                'total_requests': totals.get('requests.total', 0) + totals.get('requests.api', 0),
                'api_requests': totals.get('requests.api', 0),
                'magic_links_sent': totals.get('auth.magiclink.sent', 0),
                'magic_links_verified': totals.get('auth.magiclink.verified', 0),
                'questionnaires_started': totals.get('questionnaire.started', 0),
                'questionnaires_completed': totals.get('questionnaire.completed', 0),
                'questions_answered': totals.get('questionnaire.answered', 0),
                'errors_4xx': totals.get('errors.4xx', 0),
                'errors_5xx': totals.get('errors.5xx', 0),
            })

            # Enhanced funnel metrics
            stats['funnel'] = {
                'gate_viewed': totals.get('funnel.gate.viewed', 0),
                'gate_q1': totals.get('funnel.gate.q1_answered', 0),
                'gate_q2': totals.get('funnel.gate.q2_answered', 0),
                'email_entered': totals.get('funnel.gate.email_entered', 0),
                'completion_viewed': totals.get('funnel.completion.viewed', 0),
            }

            # Latency buckets (engagement depth)
            stats['latency'] = {
                'fast': totals.get('latency.fast', 0),
                'moderate': totals.get('latency.moderate', 0),
                'thoughtful': totals.get('latency.thoughtful', 0),
                'extended': totals.get('latency.extended', 0),
            }

            # Feature usage
            stats['features'] = {
                'skip_used': totals.get('feature.skip_used', 0),
                'newsletter_cta': totals.get('feature.newsletter.cta_clicked', 0),
            }

            # Temporal patterns (day of week)
            stats['temporal_dow'] = {
                'sun': totals.get('temporal.dow.0', 0),
                'mon': totals.get('temporal.dow.1', 0),
                'tue': totals.get('temporal.dow.2', 0),
                'wed': totals.get('temporal.dow.3', 0),
                'thu': totals.get('temporal.dow.4', 0),
                'fri': totals.get('temporal.dow.5', 0),
                'sat': totals.get('temporal.dow.6', 0),
            }

            # Temporal patterns (hour of day) - for peak hours
            hourly = {}
            for h in range(24):
                hourly[h] = totals.get(f'temporal.hour.{h}', 0)
            stats['temporal_hourly'] = hourly

    except Exception as e:
        logger.exception("Error fetching metrics")
        stats['error'] = str(e)

    return stats


def generate_report(target_date: Optional[datetime] = None) -> str:
    """Generate the daily visitor report."""
    if target_date is None:
        target_date = datetime.now(timezone.utc) - timedelta(days=1)

    date_str = target_date.strftime('%Y-%m-%d')
    logger.info(f"Generating report for {date_str}")

    # Collect stats from all sources
    caddy_stats = parse_caddy_logs(target_date)
    audience_stats = get_audience_stats(target_date)
    metrics_stats = get_metrics_stats()
    newsletter_stats = get_newsletter_stats(target_date)
    q_stats = get_questionnaire_stats(target_date)

    # Previous run, for "since last report"; and the whole history for means.
    _hist = load_history()
    _prev = _hist[-1] if _hist else {}
    _avg_keys = ['gate_submissions_total', 'completions_total', 'pdfs_total']
    _avgs = averages(_hist + [{
        'gate_submissions_total': q_stats.get('gate_submissions_total'),
        'completions_total': q_stats.get('completions_total'),
        'pdfs_total': q_stats.get('pdfs_total'),
    }], _avg_keys)

    # Build report
    report_lines = [
        f"Daily Visitor Report - {date_str}",
        "=" * 40,
        "",
        "VISITORS (app-side count)",
        "-" * 30,
    ] + _visitor_lines(audience_stats) + [
        "",
        "REQUESTS (Caddy, aformulationoftruth.com only)",
        "-" * 30,
        f"  Total Requests:     {caddy_stats.get('total_requests', 'N/A'):>8}",
        f"  Page Views:         {caddy_stats.get('page_views', 'N/A'):>8}",
        f"  API Requests:       {caddy_stats.get('api_requests', 'N/A'):>8}",
        "",
        "NEWSLETTER SUBSCRIBERS",
        "-" * 30,
        f"  Total:              {newsletter_stats.get('total_subscribers', 'N/A'):>8}",
        f"  Confirmed:          {newsletter_stats.get('confirmed_subscribers', 'N/A'):>8}",
        f"  Pending:            {newsletter_stats.get('pending_subscribers', 'N/A'):>8}",
        f"  New Today:          {newsletter_stats.get('new_signups_today', 'N/A'):>8}",
        f"  Confirmed Today:    {newsletter_stats.get('new_confirmed_today', 'N/A'):>8}",
        f"  Legacy (archived):  {newsletter_stats.get('legacy_count', 'N/A'):>8}",
        "",
        "QUESTIONNAIRE (from the database)",
        "-" * 30,
        delta_line("New Emails Today:", q_stats['gate_submissions_today'], _prev.get('gate_submissions_today')),
        delta_line("Sessions Started:", q_stats['sessions_started_today'], _prev.get('sessions_started_today')),
        delta_line("Completions Today:", q_stats['completions_today'], _prev.get('completions_today')),
        (delta_line("PDFs Generated:", q_stats['pdfs_today'], _prev.get('pdfs_today'))
         if q_stats.get('pdf_note') is None
         else f"  {'PDFs Generated:':<20}{q_stats['pdf_note']}"),
        "",
        f"AVERAGES (mean change per report, over {len(_hist)} prior runs)",
        "-" * 30,
        f"  {'Emails/report:':<20}{_fmt_avg(_avgs['gate_submissions_total']):>8}",
        f"  {'Completions/report:':<20}{_fmt_avg(_avgs['completions_total']):>8}",
        f"  {'PDFs/report:':<20}{_fmt_avg(_avgs['pdfs_total']):>8}",
        "",
        "QUESTIONNAIRE ACTIVITY (API Metrics, reset on restart)",
        "-" * 30,
        f"  Magic Links Sent:   {metrics_stats.get('magic_links_sent', 'N/A'):>8}",
        f"  Sessions Verified:  {metrics_stats.get('magic_links_verified', 'N/A'):>8}",
        f"  Q'aires Started:    {metrics_stats.get('questionnaires_started', 'N/A'):>8}",
        f"  Q'aires Completed:  {metrics_stats.get('questionnaires_completed', 'N/A'):>8}",
        f"  Questions Answered: {metrics_stats.get('questions_answered', 'N/A'):>8}",
        "",
    ]

    # Add funnel metrics if available
    funnel = metrics_stats.get('funnel', {})
    if any(funnel.values()):
        report_lines.extend([
            "CONVERSION FUNNEL",
            "-" * 30,
            f"  Gate Viewed:        {funnel.get('gate_viewed', 0):>8}",
            f"  Q1 Answered:        {funnel.get('gate_q1', 0):>8}",
            f"  Q2 Answered:        {funnel.get('gate_q2', 0):>8}",
            f"  Email Entered:      {funnel.get('email_entered', 0):>8}",
            f"  Completion Viewed:  {funnel.get('completion_viewed', 0):>8}",
            "",
        ])

    # Add engagement depth (latency buckets)
    latency = metrics_stats.get('latency', {})
    total_responses = sum(latency.values())
    if total_responses > 0:
        report_lines.extend([
            "ENGAGEMENT DEPTH (Response Time)",
            "-" * 30,
            f"  Fast (<30s):        {latency.get('fast', 0):>8}  ({latency.get('fast', 0)*100//total_responses:>2}%)",
            f"  Moderate (30s-2m):  {latency.get('moderate', 0):>8}  ({latency.get('moderate', 0)*100//total_responses:>2}%)",
            f"  Thoughtful (2-5m):  {latency.get('thoughtful', 0):>8}  ({latency.get('thoughtful', 0)*100//total_responses:>2}%)",
            f"  Extended (>5m):     {latency.get('extended', 0):>8}  ({latency.get('extended', 0)*100//total_responses:>2}%)",
            "",
        ])

    # Add feature usage
    features = metrics_stats.get('features', {})
    if any(features.values()):
        report_lines.extend([
            "FEATURE USAGE",
            "-" * 30,
            f"  Skip Button Used:   {features.get('skip_used', 0):>8}",
            f"  Newsletter CTA:     {features.get('newsletter_cta', 0):>8}",
            "",
        ])

    # Add error summary
    report_lines.extend([
        "ERROR SUMMARY",
        "-" * 30,
        f"  4xx Errors:         {caddy_stats.get('errors_4xx', 0):>8}",
        f"  5xx Errors:         {caddy_stats.get('errors_5xx', 0):>8}",
        "",
    ])

    # Add top paths
    if caddy_stats.get('top_paths'):
        report_lines.append("TOP PAGES")
        report_lines.append("-" * 30)
        for path, count in list(caddy_stats['top_paths'].items())[:5]:
            report_lines.append(f"  {count:>6}  {path}")
        report_lines.append("")

    # Add hourly traffic if available
    if caddy_stats.get('hourly_traffic'):
        report_lines.append("HOURLY TRAFFIC (UTC)")
        report_lines.append("-" * 30)
        hourly = caddy_stats['hourly_traffic']
        max_traffic = max(hourly.values()) if hourly else 1
        for hour in range(24):
            count = hourly.get(hour, 0)
            bar_len = int(20 * count / max_traffic) if max_traffic > 0 else 0
            bar = "█" * bar_len
            report_lines.append(f"  {hour:02d}:00 | {count:>5} {bar}")
        report_lines.append("")

    # Add data source notes
    report_lines.extend([
        "-" * 40,
        "Data Sources:",
        f"  Caddy Logs: {'OK' if not caddy_stats.get('error') else caddy_stats.get('error')}",
        f"  API Metrics: {'OK' if not metrics_stats.get('error') else metrics_stats.get('error')}",
        f"  Newsletter DB: {'OK' if not newsletter_stats.get('error') else newsletter_stats.get('error')}",
        "",
        "Generated: " + datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC'),
        "Server: aformulationoftruth.com",
    ])

    # Record this run so the next report can show the change since it, and so
    # the averages have another data point. Written last: a failure to persist
    # must not cost us the report itself.
    append_history({
        'at': datetime.now(timezone.utc).isoformat(),
        'date': target_date.strftime('%Y-%m-%d'),
        'gate_submissions_today': q_stats.get('gate_submissions_today'),
        'gate_submissions_total': q_stats.get('gate_submissions_total'),
        'sessions_started_today': q_stats.get('sessions_started_today'),
        'completions_today': q_stats.get('completions_today'),
        'completions_total': q_stats.get('completions_total'),
        'pdfs_today': q_stats.get('pdfs_today'),
        'pdfs_total': q_stats.get('pdfs_total'),
        'newsletter_total': newsletter_stats.get('total_subscribers'),
    })

    return "\n".join(report_lines)


def send_report(report: str, target_date: datetime, metrics_stats: Optional[Dict] = None) -> None:
    """Send report via all configured channels."""
    date_str = target_date.strftime('%Y-%m-%d')

    # Extract key stats for Telegram summary
    lines = report.split('\n')
    unique_visitors = 'N/A'
    total_subscribers = 'N/A'
    new_signups = 'N/A'
    questionnaires_completed = 'N/A'
    for line in lines:
        if 'Visitors (upper bound):' in line:
            unique_visitors = line.split(':')[-1].strip()
        elif 'Total Signups:' in line:
            total_subscribers = line.split(':')[-1].strip()
        elif 'New Today:' in line and new_signups == 'N/A':
            new_signups = line.split(':')[-1].strip()
        elif "Q'aires Completed:" in line:
            questionnaires_completed = line.split(':')[-1].strip()

    # Calculate funnel conversion if metrics available
    funnel_summary = ""
    engagement_summary = ""
    if metrics_stats:
        funnel = metrics_stats.get('funnel', {})
        gate_viewed = funnel.get('gate_viewed', 0)
        completion_viewed = funnel.get('completion_viewed', 0)
        if gate_viewed > 0:
            conversion = (completion_viewed / gate_viewed) * 100
            funnel_summary = f"\n📈 Funnel Conversion: <b>{conversion:.1f}%</b> ({completion_viewed}/{gate_viewed})"

        latency = metrics_stats.get('latency', {})
        thoughtful = latency.get('thoughtful', 0) + latency.get('extended', 0)
        total_responses = sum(latency.values())
        if total_responses > 0:
            deep_pct = (thoughtful / total_responses) * 100
            engagement_summary = f"\n🧘 Deep Engagement: <b>{deep_pct:.0f}%</b> ({thoughtful} thoughtful responses)"

    # Telegram (bilingual summary - English & Tamil)
    telegram_msg = f"""🙏 <b>namaste / நமஸ்தே</b>

📊 <b>Daily Report / தினசரி அறிக்கை - {date_str}</b>

👥 Unique Visitors / பார்வையாளர்கள்: <b>{unique_visitors}</b>

📬 Newsletter / செய்திமடல்: <b>{total_subscribers}</b> (new: {new_signups})

📝 Questionnaires Completed: <b>{questionnaires_completed}</b>{funnel_summary}{engagement_summary}

<i>Full report via email / முழு அறிக்கை மின்னஞ்சலில்</i>

— a formulation of truth —"""

    send_telegram_message(telegram_msg)

    # Email (full report with bilingual greeting)
    subject = f"Daily Visitor Report / தினசரி அறிக்கை - {date_str}"
    email_body = f"""🙏 namaste / நமஸ்தே

{report}

— a formulation of truth —
"""
    send_email_report(subject, email_body)


def main():
    """Generate and send daily report."""
    logger.info("=" * 50)
    logger.info("A Formulation of Truth - Daily Report Generator")
    logger.info("=" * 50)

    # The current day, not yesterday: this runs three times daily and each
    # report should show the day as it stands, with the change since the last
    # run. A yesterday-report would be identical at 8am, 6pm and 11:15pm.
    target_date = datetime.now(timezone.utc)

    # Allow date override via argument
    if len(sys.argv) > 1:
        try:
            target_date = datetime.strptime(sys.argv[1], '%Y-%m-%d').replace(tzinfo=timezone.utc)
        except ValueError:
            logger.error(f"Invalid date format: {sys.argv[1]}. Use YYYY-MM-DD")
            sys.exit(1)

    report = generate_report(target_date)
    print(report)
    print()

    # Get metrics for Telegram summary
    metrics_stats = get_metrics_stats()
    send_report(report, target_date, metrics_stats)
    logger.info("Report generation complete")


if __name__ == '__main__':
    main()
