#!/usr/bin/env python3
"""
Daily Visitor Report for A Formulation of Truth

Generates daily visitor statistics from:
1. Caddy access logs (primary source)
2. /api/metrics endpoint (secondary/cross-reference)

Sends report via Email (SendGrid) and Telegram.

Privacy: Aggregates counts only. No individual IP addresses, user agents, or PII are logged or reported.
Logs are read and discarded - not stored beyond this script's execution.

Environment Variables Required:
- TELEGRAM_BOT_TOKEN: Telegram bot API token
- TELEGRAM_CHAT_ID: Chat ID to send reports to
- SENDGRID_API_KEY: SendGrid API key for email reports
- REPORT_EMAIL: Email address to receive reports
- SENDGRID_FROM_EMAIL: Sender email address
"""

import os
import sys
import json
import gzip
import re
import logging
import subprocess
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
    'sendgrid_api_key': os.environ.get('SENDGRID_API_KEY', ''),
    'report_email': os.environ.get('REPORT_EMAIL', os.environ.get('ALERT_EMAIL', 'nyagrodha@icloud.com')),
    'from_email': os.environ.get('SENDGRID_FROM_EMAIL', 'formitselfisemptiness@aformulationoftruth.com'),
    'caddy_log_path': os.environ.get('CADDY_LOG_PATH', '/var/log/caddy/access.log'),
    'database_url': os.environ.get('DATABASE_URL', ''),
}

# Validate required configuration at import time
if not CONFIG['database_url']:
    raise EnvironmentError(
        "DATABASE_URL environment variable is required but not set. "
        "Please set DATABASE_URL to a valid PostgreSQL connection string."
    )

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
    """Send report via SendGrid API."""
    if not CONFIG['sendgrid_api_key']:
        logger.warning("SendGrid API key not configured")
        return False

    try:
        url = "https://api.sendgrid.com/v3/mail/send"
        payload = {
            "personalizations": [{
                "to": [{"email": CONFIG['report_email']}]
            }],
            "from": {
                "email": CONFIG['from_email'],
                "name": "A Formulation of Truth Reports"
            },
            "subject": subject,
            "content": [{
                "type": "text/plain",
                "value": body
            }]
        }

        data = json.dumps(payload).encode('utf-8')
        req = Request(url, data=data, method='POST')
        req.add_header('Authorization', f'Bearer {CONFIG["sendgrid_api_key"]}')
        req.add_header('Content-Type', 'application/json')

        with urlopen(req, timeout=15) as response:
            return response.status in [200, 202]
    except Exception:
        logger.exception("Failed to send email report")
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
        queries = {
            'total': "SELECT COUNT(*) FROM newsletter_unified",
            'confirmed': "SELECT COUNT(*) FROM newsletter_unified WHERE status = 'confirmed'",
            'pending': "SELECT COUNT(*) FROM newsletter_unified WHERE status = 'pending'",
            'new_today': f"SELECT COUNT(*) FROM newsletter_unified WHERE created_at::date = '{date_str}'",
            'confirmed_today': f"SELECT COUNT(*) FROM newsletter_unified WHERE confirmed_at::date = '{date_str}'",
            # Legacy tables (for historical reference)
            'legacy': """SELECT
                (SELECT COUNT(*) FROM newsletter_emails WHERE subscribed = true) +
                (SELECT COUNT(*) FROM newsletter_subscribers WHERE unsubscribed_at IS NULL)
            """,
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


def parse_caddy_logs(target_date: datetime) -> Dict[str, Any]:
    """
    Parse Caddy JSON access logs for the target date.

    Returns aggregate counts only - no individual request data stored.
    IPs are immediately hashed for unique visitor counting, then discarded.
    """
    stats = {
        'unique_visitors': 0,
        'total_requests': 0,
        'page_views': 0,
        'api_requests': 0,
        'questionnaire_starts': 0,
        'gate_submissions': 0,
        'errors_4xx': 0,
        'errors_5xx': 0,
        'top_paths': defaultdict(int),
        'hourly_traffic': defaultdict(int),
        'source': 'caddy_logs',
    }

    log_path = Path(CONFIG['caddy_log_path'])
    if not log_path.exists():
        logger.warning(f"Caddy log file not found: {log_path}")
        stats['error'] = 'Log file not found'
        return stats

    # Use set to count unique visitors (hashed IPs, discarded after counting)
    unique_visitor_hashes: Set[int] = set()

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
                    uri = request.get('uri', '')
                    method = request.get('method', '')
                    status = entry.get('status', 0)

                    # Skip static resources for page view counting
                    is_static = is_static_resource(uri)

                    stats['total_requests'] += 1

                    if not is_static:
                        stats['page_views'] += 1

                    # Count unique visitors (hash client IP immediately, don't store)
                    client_ip = request.get('client_ip', request.get('remote_addr', ''))
                    if client_ip:
                        # Hash immediately - we never store the actual IP
                        ip_hash = hash(client_ip)
                        unique_visitor_hashes.add(ip_hash)

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

        stats['unique_visitors'] = len(unique_visitor_hashes)

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
        req = Request('http://localhost:8393/api/metrics', method='GET')
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
                'donate_cta': totals.get('feature.donate.cta_clicked', 0),
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
    metrics_stats = get_metrics_stats()
    newsletter_stats = get_newsletter_stats(target_date)

    # Build report
    report_lines = [
        f"Daily Visitor Report - {date_str}",
        "=" * 40,
        "",
        "VISITOR STATISTICS (Caddy Logs)",
        "-" * 30,
        f"  Unique Visitors:    {caddy_stats.get('unique_visitors', 'N/A'):>8}",
        f"  Total Requests:     {caddy_stats.get('total_requests', 'N/A'):>8}",
        f"  Page Views:         {caddy_stats.get('page_views', 'N/A'):>8}",
        f"  API Requests:       {caddy_stats.get('api_requests', 'N/A'):>8}",
        "",
        "NEWSLETTER SUBSCRIBERS (Unified)",
        "-" * 30,
        f"  Total:              {newsletter_stats.get('total_subscribers', 'N/A'):>8}",
        f"  Confirmed:          {newsletter_stats.get('confirmed_subscribers', 'N/A'):>8}",
        f"  Pending:            {newsletter_stats.get('pending_subscribers', 'N/A'):>8}",
        f"  New Today:          {newsletter_stats.get('new_signups_today', 'N/A'):>8}",
        f"  Confirmed Today:    {newsletter_stats.get('new_confirmed_today', 'N/A'):>8}",
        f"  Legacy (archived):  {newsletter_stats.get('legacy_count', 'N/A'):>8}",
        "",
        "QUESTIONNAIRE ACTIVITY (API Metrics)",
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
            f"  Donate CTA:         {features.get('donate_cta', 0):>8}",
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
        if 'Unique Visitors:' in line:
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

    # Default to yesterday's report
    target_date = datetime.now(timezone.utc) - timedelta(days=1)

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
