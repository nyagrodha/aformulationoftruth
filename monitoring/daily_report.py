#!/usr/bin/env python3
"""
Site Report for A Formulation of Truth

Named for what it covers. It was the "Daily Visitor Report", which was wrong
twice over: it runs three times a day, and visitor counts are now the smallest
section in it -- most of the mail is about the gate, the questionnaire and the
health of the request path.

Sources, in the order they appear in the mail:
1. fresh_audience_windows  -- app-side audience counter
2. Caddy access logs       -- request path, errors, top pages
3. the database            -- gate, sessions, newsletter
4. /api/metrics            -- in-process counters, reset by every deploy

Sends the report via Email (SMTP) and Telegram.

Every number in the mail carries a sentence saying what it counts and what it
does not. That is not decoration: several figures here are easy to misread as
something better or worse than they are (see EXPLAIN, below), and a report
nobody can interpret is one nobody reads.

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
import ssl
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
_REPORT_HOSTS_DEFAULT = 'aformulationoftruth.com,www.aformulationoftruth.com,app.aformulationoftruth.com'
REPORT_HOSTS = {
    h.strip().lower()
    for h in os.environ.get('REPORT_HOSTS', _REPORT_HOSTS_DEFAULT).split(',')
    if h.strip()
}
if not REPORT_HOSTS:
    # An empty allowlist files every request under "other host" and prints a
    # REQUESTS section of zeros indistinguishable from a dead site -- the
    # exact failure mode this file documents elsewhere. REPORT_HOSTS='' or
    # REPORT_HOSTS=',' both land here.
    logger.warning("REPORT_HOSTS resolved to an empty set; using the built-in default")
    REPORT_HOSTS = {h.strip().lower() for h in _REPORT_HOSTS_DEFAULT.split(',')}

# Static resources to exclude from visitor counts
STATIC_EXTENSIONS = {'.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.map'}

# Hosts that are ours but are NOT this site. They are named so the mail can say
# "108 requests went to proust" rather than letting them vanish into a single
# opaque "other hosts" figure -- a request that disappears without explanation
# is indistinguishable from traffic we lost.
SIBLING_HOSTS = {
    h.strip().lower()
    for h in os.environ.get(
        'SIBLING_HOSTS', 'proust.aformulationoftruth.com',
    ).split(',')
    if h.strip()
}

# Paths a scanner asks for that this site has never served. Their 404s are not a
# fault in anything and reporting them beside real 4xx made the error line look
# alarming every single day; see split_4xx.
PROBE_MARKERS = (
    'wp-', 'wordpress', 'xmlrpc', 'index.php', '.php', '.env', '.git',
    'phpmyadmin', 'admin', 'signin', 'signup', 'register', 'login',
    'dashboard', '_profiler', 'vendor/', 'cgi-bin', '.aws', 'config.json',
    'autodiscover', 'owa/', 'telescope', 'actuator',
)

# Width of the value column in the mail, so every section lines up.
VAL_W = 10

# How deep the explanation under each figure is indented.
_EXPLAIN_INDENT = ' ' * 6


def line(label: str, value: Any, explain: str = '') -> List[str]:
    """One figure: label, right-aligned value, and what it actually counts.

    The explanation is the point of this function. Nearly every number in this
    report has a plausible wrong reading -- "visitors" that are not people,
    "completions" that are abandonments, a zero that means "not deployed"
    rather than "nobody came" -- and the only durable fix is to say so on the
    line itself, every time, rather than in a legend at the bottom that the eye
    skips.
    """
    out = [f"  {label:<28}{str(value):>{VAL_W}}"]
    if explain:
        out.extend(_wrap(explain))
    return out


def _wrap(text: str, width: int = 66) -> List[str]:
    """Hard-wrap an explanation under its figure. No textwrap import needed."""
    words, cur, out = text.split(), '', []
    for w in words:
        if cur and len(cur) + 1 + len(w) > width:
            out.append(_EXPLAIN_INDENT + cur)
            cur = w
        else:
            cur = f"{cur} {w}".strip()
    if cur:
        out.append(_EXPLAIN_INDENT + cur)
    return out


def heading(title: str, source: str) -> List[str]:
    """A section title that names where its numbers come from.

    Four different sources feed this mail and they disagree with each other by
    design -- the database is durable, /api/metrics resets on deploy, Caddy sees
    requests the app never handled. A section whose provenance is unstated
    invites the reader to reconcile figures that were never meant to match.
    """
    src = _wrap(f"source: {source}", width=60)
    # First line loses the deep indent so 'source:' sits under the title.
    src[0] = '  ' + src[0].strip()
    return [title, *src, "-" * 64]


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
        # Explicit context: smtplib's own default (context=None) falls back to
        # ssl._create_stdlib_context, which does not verify the certificate or
        # the hostname -- unverified even on 3.12. create_default_context is
        # what actually turns this connection on, matching romania/send_mail.py.
        tls_context = ssl.create_default_context()
        if CONFIG['smtp_secure']:
            # Implicit TLS, port 465.
            with smtplib.SMTP_SSL(
                CONFIG['smtp_host'], CONFIG['smtp_port'], timeout=30, context=tls_context,
            ) as smtp:
                smtp.login(CONFIG['smtp_user'], CONFIG['smtp_pass'])
                smtp.send_message(msg)
        else:
            # STARTTLS, port 587 -- Apple's submission default.
            with smtplib.SMTP(CONFIG['smtp_host'], CONFIG['smtp_port'], timeout=30) as smtp:
                smtp.starttls(context=tls_context)
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
        if r.returncode != 0:
            # Without this, every one of the report's N/A-seeded figures looks
            # identical whether the table is missing, the role lacks a grant,
            # or the query has a typo -- and the only way to tell them apart
            # used to be running the query by hand.
            logger.warning(
                "psql query failed (exit %s): %s", r.returncode, r.stderr.strip()[:500],
            )
            return None
        return r.stdout.strip()
    except subprocess.TimeoutExpired:
        logger.warning("psql query timed out after 15s")
        return None
    except Exception as exc:
        logger.warning("psql query raised %s: %s", type(exc).__name__, exc)
        return None


def get_questionnaire_stats(target_date: datetime) -> Dict[str, Any]:
    """Gate submissions, sessions, real completions and PDF deliveries.

    Counted from the tables rather than the in-process /api/metrics counters,
    which reset whenever the service restarts and therefore cannot answer
    "how many today" across a deploy.

    ## Why "completions" is split in two

    fresh_questionnaire_sessions.completed_at does NOT mean "this person
    finished the questionnaire". lib/questionnaire-session.ts sets it in two
    unrelated situations:

      1. completeSession() -- the reader answered the last question.
      2. createSession() -- the SAME address started again, so the older,
         unfinished session is stamped completed_at purely to get it out of the
         "one active session per address" index.

    Case 2 is an abandonment. Counting the two together is how this report came
    to mail "Completions Today: 73" on a day when not one person answered a
    single questionnaire question. Every figure was arithmetically correct and
    the headline was false, which is the worst shape a metric can take.

    They are separated here by whether the session made any progress at all:
    current_index > 0 or a non-empty answered_questions. A session stamped
    complete while still sitting at question zero did not finish anything.

    Aggregates only. No address, no hash, no answer text leaves this function.
    """
    d = target_date.strftime('%Y-%m-%d')
    stats: Dict[str, Any] = {
        'gate_submissions_today': 'N/A', 'gate_submissions_total': 'N/A',
        'distinct_addresses_today': 'N/A', 'repeat_submissions_today': 'N/A',
        'gate_answers_today': 'N/A',
        'finished_today': 'N/A', 'finished_total': 'N/A',
        'superseded_today': 'N/A',
        'in_progress': 'N/A',
        'questionnaire_answers_total': 'N/A', 'questionnaire_answers_today': 'N/A',
        'questionnaire_answer_sessions': 'N/A',
        'links_sent_today': 'N/A', 'links_used_today': 'N/A',
        'pdfs_today': 'N/A', 'pdfs_total': 'N/A', 'pdf_note': None,
    }

    # A gate submission is one person handing over an address, so this is the
    # "new emails in the database" count -- though only the SHA-256 hash and an
    # age-encrypted copy are ever stored.
    v = _psql(f"SELECT COUNT(*) FILTER (WHERE created_at::date = '{d}'), COUNT(*) FROM fresh_gate_responses")
    if v and '|' in v:
        stats['gate_submissions_today'], stats['gate_submissions_total'] = (int(x) for x in v.split('|'))

    # Distinct addresses, so the mail can say how much of the day's traffic is
    # the same handful of people going round again. Sessions-started used to sit
    # here and was pure noise: a session row is created by the gate handler on
    # every submission, so it equalled gate submissions exactly, every report.
    v = _psql(
        "SELECT COUNT(*), COUNT(DISTINCT email_hash) FROM fresh_questionnaire_sessions "
        f"WHERE created_at::date = '{d}'"
    )
    if v and '|' in v:
        total_sessions, distinct = (int(x) for x in v.split('|'))
        stats['distinct_addresses_today'] = distinct
        stats['repeat_submissions_today'] = total_sessions - distinct

    # The split described in the docstring.
    v = _psql(
        "SELECT "
        f"COUNT(*) FILTER (WHERE completed_at::date = '{d}' AND (current_index > 0 OR cardinality(answered_questions) > 0)), "
        "COUNT(*) FILTER (WHERE completed_at IS NOT NULL AND (current_index > 0 OR cardinality(answered_questions) > 0)), "
        f"COUNT(*) FILTER (WHERE completed_at::date = '{d}' AND current_index = 0 AND cardinality(answered_questions) = 0), "
        "COUNT(*) FILTER (WHERE completed_at IS NULL) "
        "FROM fresh_questionnaire_sessions"
    )
    if v and v.count('|') == 3:
        a, b, c, e = (int(x) for x in v.split('|'))
        stats['finished_today'], stats['finished_total'] = a, b
        stats['superseded_today'], stats['in_progress'] = c, e

    # The two gate questions, stored encrypted. Two rows per submission is the
    # healthy shape; anything less means the encryption path is dropping answers
    # while the gate still hands back a token. gate_encrypted_answers also
    # holds questionnaire rows at indices 2-34 -- filtered out here, or
    # ordinary questionnaire activity inflates this figure and hides a real
    # gate-encryption drop.
    v = _psql(
        f"SELECT COUNT(*) FROM gate_encrypted_answers "
        f"WHERE created_at::date = '{d}' AND question_index <= 1"
    )
    if v is not None and v.isdigit():
        stats['gate_answers_today'] = int(v)

    # Questionnaire answers are the rows in gate_encrypted_answers ABOVE the two
    # gate indices -- that table holds both, keyed by session and question
    # index. (fresh_responses is a legacy plaintext table that nothing has
    # written to since the encrypted path shipped; reading it would report a
    # permanent, meaningless zero.)
    #
    # This is the single most important line in the report. It read 0 across
    # 2,565 sessions because routes/questionnaire.tsx could not store an answer
    # at all -- fixed 2026-08-21 -- and it is asked for by name so that a
    # recurrence is visible the same day rather than after a year.
    v = _psql("SELECT COUNT(*), COUNT(*) FILTER (WHERE question_index > 1) FROM gate_encrypted_answers")
    if v and '|' in v:
        _all, _past_gate = (int(x) for x in v.split('|'))
        stats['questionnaire_answers_total'] = _past_gate

    # How many DIFFERENT people are behind that count. The raw total can read 35
    # while one person answered a whole questionnaire and nobody else answered
    # anything, which is the difference between a working funnel and a working
    # operator. Sessions rather than addresses: the gate rows are keyed by
    # gate_token and the questionnaire rows by session id, and no address is
    # recoverable from either.
    v = _psql(
        "SELECT COUNT(DISTINCT session_id) FROM gate_encrypted_answers "
        "WHERE question_index > 1"
    )
    if v is not None and v.isdigit():
        stats['questionnaire_answer_sessions'] = int(v)

    v = _psql(
        "SELECT COUNT(*) FILTER (WHERE question_index > 1) FROM gate_encrypted_answers "
        f"WHERE created_at::date = '{d}'"
    )
    if v is not None and v.isdigit():
        stats['questionnaire_answers_today'] = int(v)

    # Sent vs used is the honest read on delivery: a link that is never clicked
    # is either undelivered, in a spam folder, or unwanted, and the three look
    # identical from here -- but a collapse in the ratio is visible immediately.
    v = _psql(
        "SELECT COUNT(*), COUNT(used_at) FROM fresh_magic_links "
        f"WHERE created_at::date = '{d}'"
    )
    if v and '|' in v:
        stats['links_sent_today'], stats['links_used_today'] = (int(x) for x in v.split('|'))

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
        stats['pdf_note'] = 'not deployed (migration 010 pending)'

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


def delta_line(label: str, current: Any, previous: Any, width: int = VAL_W) -> str:
    """One row: value now, and the change since the previous report."""
    cur = _num(current)
    if cur is None:
        return f"  {label:<28}{str(current):>{width}}"
    prev = _num(previous)
    if prev is None:
        return f"  {label:<28}{current:>{width}}   (no previous run on record)"
    d = cur - prev
    arrow = '+' if d > 0 else ('' if d == 0 else '')
    return f"  {label:<28}{current:>{width}}   ({arrow}{d:g} since the previous run)"


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


def _audience_lines(a: Dict[str, Any]) -> List[str]:
    """The audience section, or a fault. A silent 0 is how the old counter hid."""
    if not a.get('available'):
        return ["  COUNTER UNREACHABLE - could not read fresh_audience_windows."]
    if a.get('windows', 0) == 0:
        return [
            "  RECORDER NOT RUNNING - no windows recorded at all.",
            *_wrap(
                "The app writes one row per 4-hour UTC window. None today means "
                "the counter is not running, not that nobody came -- Caddy's "
                "request figures below will show whether traffic arrived."
            ),
        ]

    out = line(
        "People (upper bound)", a['visitors'],
        "Distinct visitors within each 4-hour window, summed over the day. "
        "Someone who returns in a later window, or after a restart, is counted "
        "again, so this can only OVER-state. It is a ceiling on how many people "
        "came, never a count of unique people.",
    ) + line(
        "Link previews", a['bot_visitors'],
        "Counted separately, not dropped: requests whose user-agent names a "
        "crawler or a chat app fetching a preview card. Excluded from the "
        "figure above.",
    ) + line(
        "Requests seen", a['requests'],
        "Every request the counter looked at, including repeats from the same "
        "person. Not a headcount; it is the denominator for the one above.",
    ) + line(
        "Windows recorded", f"{a['windows']} / {a['expected_windows']}",
        "Recorded versus expected so far today (one per completed 4-hour UTC "
        "window). Short means the app restarted mid-window or the counter "
        "stopped; each restart also inflates the People figure.",
    )

    if a.get('truncated'):
        out.extend(_wrap(
            "NOTE: a window hit its 200,000-pseudonym cap. For that window the "
            "figure stopped rising, so today's People number is a FLOOR rather "
            "than the usual ceiling."
        ))
    return out


def get_audience_stats(target_date: datetime) -> Dict[str, Any]:
    """Visitor counts from the app-side counter (fresh_audience_windows)."""
    day = target_date.strftime('%Y-%m-%d')
    row = _psql(
        "SELECT COALESCE(SUM(visitors),0), COALESCE(SUM(bot_visitors),0), "
        "COALESCE(SUM(requests),0), COALESCE(BOOL_OR(truncated),false), COUNT(DISTINCT window_start), "
        "COUNT(DISTINCT run_id) "
        "FROM fresh_audience_windows WHERE site='a4t' "
        f"AND window_start >= '{day}T00:00:00+00' AND window_start < '{day}T00:00:00+00'::timestamptz + interval '1 day'"
    )
    if not row:
        return {'available': False}
    v, b, r, trunc, windows, runs = (row.split('|') + [''] * 6)[:6]

    # Expected windows: six in a whole day, fewer when the report runs part-way
    # through one. Comparing against a flat 6 made the 08:00 report accuse a
    # perfectly healthy counter of having stopped.
    #
    # Counts only COMPLETED windows: recordVisit only opens a window after a
    # request lands in it, and persist skips an empty window, so at an exact
    # 4-hour boundary (e.g. 08:00:00) the window that just started has no row
    # yet. now.hour // 4 + 1 would require that row to exist a moment before
    # it can, reporting 2/3 for a counter that has not missed anything.
    now = datetime.now(timezone.utc)
    if target_date.strftime('%Y-%m-%d') == now.strftime('%Y-%m-%d'):
        expected = now.hour // 4
    else:
        expected = 6

    return {
        'available': True,
        'visitors': int(v or 0),
        'bot_visitors': int(b or 0),
        'requests': int(r or 0),
        'truncated': (trunc or 'f') == 't',
        'windows': int(windows or 0),
        'runs': int(runs or 0),
        'expected_windows': expected,
    }


def is_probe(path: str) -> bool:
    """Does this path look like a vulnerability scanner rather than a reader?

    Deliberately generous. A false positive costs us one 404 filed under noise;
    a false negative puts scanner traffic back into the figure that is supposed
    to mean "our own pages are breaking", which is the failure that matters.
    """
    p = path.split('?')[0].lower()
    return any(m in p for m in PROBE_MARKERS)


def log_files_for(target_date: datetime) -> List[Path]:
    """Every access log that could hold lines for the target date.

    Caddy rotates access.log at midnight, so a report asked for any day but the
    current one used to read a file containing none of it and print a confident
    zero across every request figure. Rotated siblings are included whenever
    their mtime is at or after the start of the target day.
    """
    base = Path(CONFIG['caddy_log_path'])
    day_start = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
    out: List[Path] = []
    if base.exists():
        out.append(base)
    parent, stem = base.parent, base.name
    if parent.is_dir():
        for cand in sorted(parent.iterdir()):
            if cand.name == stem or not cand.name.startswith(stem):
                continue
            try:
                # A rotated file is closed at rotation, so its mtime is the last
                # moment it could have received a line. Older than the day we
                # want means it cannot contain that day.
                if datetime.fromtimestamp(cand.stat().st_mtime, tz=timezone.utc) >= day_start:
                    out.append(cand)
            except OSError:
                continue
    return out


def parse_caddy_logs(target_date: datetime) -> Dict[str, Any]:
    """
    Parse Caddy JSON access logs for the target date.

    Returns aggregate counts only - no individual request data stored.
    IPs are never read: the Caddyfile deletes them before the line is written.
    """
    stats = {
        # No 'unique_visitors' here. It used to live in this dict and was always
        # 0: it was derived from request>client_ip, which the Caddyfile deletes
        # before the line is written. Visitor counts now come from the app-side
        # counter -- see get_audience_stats.
        'total_requests': 0,
        'page_views': 0,
        'api_requests': 0,
        'questionnaire_views': 0,
        'questionnaire_bounces': 0,
        'verify_ok': 0,
        'verify_error': 0,
        'gate_submissions': 0,
        'errors_404_probe': 0,
        'errors_404_site': 0,
        'errors_4xx_other': 0,
        'errors_5xx': 0,
        'top_paths': defaultdict(int),
        'hourly_traffic': defaultdict(int),
        # Reported rather than silently dropped: a wrong allowlist should show
        # up as a visible number, not as traffic that quietly vanished.
        'other_host_requests': 0,
        'sibling_host_requests': defaultdict(int),
        'files_read': 0,
        'source': 'caddy_logs',
    }

    paths = log_files_for(target_date)
    if not paths:
        logger.warning("No Caddy access log found")
        stats['error'] = 'Log file not found'
        return stats

    target_date_str = target_date.strftime('%Y-%m-%d')

    for log_path in paths:
        try:
            if log_path.suffix == '.gz':
                fh = gzip.open(log_path, 'rt', encoding='utf-8', errors='ignore')
            else:
                fh = open(log_path, 'r', encoding='utf-8', errors='ignore')
            stats['files_read'] += 1

            with fh as f:
                for line_text in f:
                    try:
                        entry = json.loads(line_text.strip())

                        # Get timestamp and filter by date
                        ts = entry.get('ts', 0)
                        if ts:
                            entry_date = datetime.fromtimestamp(ts, tz=timezone.utc)
                            if entry_date.strftime('%Y-%m-%d') != target_date_str:
                                continue
                        else:
                            continue

                        request = entry.get('request', {})

                        # One access.log carries every vhost -- fobdongle.com,
                        # gimbal, proust, terra, the VPN panel. Without this
                        # filter every number below is a sum across unrelated
                        # sites, which is what it silently was until 2026-08-19.
                        # request>host survives the Caddy filter, so no proxy
                        # change is needed.
                        host = (request.get('host') or '').split(':')[0].lower()
                        if host not in REPORT_HOSTS:
                            if host in SIBLING_HOSTS:
                                stats['sibling_host_requests'][host] += 1
                            else:
                                stats['other_host_requests'] += 1
                            continue

                        # Counted only for hosts this report is about, so the
                        # histogram matches the totals above it rather than
                        # summing in every unrelated site on the box.
                        stats['hourly_traffic'][entry_date.hour] += 1

                        uri = request.get('uri', '')
                        method = request.get('method', '')
                        status = entry.get('status', 0)

                        # Skip static resources for page view counting
                        is_static = is_static_resource(uri)
                        clean_path = uri.split('?')[0]

                        stats['total_requests'] += 1

                        if not is_static:
                            stats['page_views'] += 1
                            stats['top_paths'][clean_path[:50]] += 1

                        # Categorize requests
                        if uri.startswith('/api/'):
                            stats['api_requests'] += 1
                            # Both the old (/gate-submit) and new (/api/gate)
                            # endpoints, so the figure survives the cutover.
                            if method == 'POST' and ('/gate-submit' in uri or '/api/gate' in uri):
                                stats['gate_submissions'] += 1

                        # CORRECTED 2026-08-20. This counted GETs of
                        # /api/questions/next, a route that does not exist --
                        # it reported 0 every day since it was written, which
                        # read as "nobody opened the questionnaire". The page
                        # itself is /questionnaire.
                        #
                        # CORRECTED AGAIN 2026-08-22. `status < 400` counted the
                        # 302 as an open. /questionnaire redirects to / whenever
                        # the JWT is missing, expired, or its session cannot be
                        # found, so a bounce -- the respondent seeing the
                        # landing page instead of a question -- was being
                        # reported as an arrival. Across the retained logs that
                        # was 399 bounces counted as opens against 299 real
                        # ones. Only a 200 means a question was rendered.
                        if clean_path.rstrip('/') == '/questionnaire':
                            if status == 200:
                                stats['questionnaire_views'] += 1
                            elif status == 302:
                                stats['questionnaire_bounces'] += 1

                        # The magic link's landing page. It renders its own
                        # error page with status 200 and only redirects on
                        # success, so the two statuses are the whole story:
                        # 302 means the link worked, 200 means the respondent
                        # was told it did not.
                        if clean_path.rstrip('/') == '/auth/verify':
                            if status == 302:
                                stats['verify_ok'] += 1
                            elif status == 200:
                                stats['verify_error'] += 1

                        # Count errors, splitting scanner noise from our own.
                        # Lumped together, a day of ordinary WordPress probing
                        # showed up as ~970 "errors" and made the section
                        # useless for spotting a real fault.
                        if status == 404:
                            if is_probe(clean_path):
                                stats['errors_404_probe'] += 1
                            else:
                                stats['errors_404_site'] += 1
                        elif 400 <= status < 500:
                            stats['errors_4xx_other'] += 1
                        elif status >= 500:
                            stats['errors_5xx'] += 1

                    except json.JSONDecodeError:
                        continue  # Skip malformed lines
                    except Exception:
                        continue  # Skip problematic entries

        except Exception as e:
            logger.exception("Error parsing Caddy log")
            stats['error'] = str(e)

    # Convert top_paths to sorted list
    stats['top_paths'] = dict(sorted(
        stats['top_paths'].items(),
        key=lambda x: x[1],
        reverse=True
    )[:10])
    stats['sibling_host_requests'] = dict(stats['sibling_host_requests'])

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
                # The application's own view of answer storage, next to the
                # database's. These have been emitted by lib/answers.ts since
                # the storage path was repaired and read by nothing.
                'answers_stored': totals.get('answers.stored', 0),
                'answers_store_failed': totals.get('answers.store_failed', 0),
                'answers_lost_to_auth': totals.get('answers.lost_to_auth', 0),
            })

            # Why people were turned away from a questionnaire route. Before
            # these existed the same situations produced a bare redirect to the
            # landing page, indistinguishable in the logs from ordinary traffic.
            stats['interstitial'] = {
                'nocookie': totals.get('funnel.interstitial.nocookie', 0),
                'expired': totals.get('funnel.interstitial.expired', 0),
                'notfound': totals.get('funnel.interstitial.notfound', 0),
                'finished': totals.get('funnel.interstitial.finished', 0),
                'resume_redeemed': totals.get('auth.resume.redeemed', 0),
            }

            # Per-question drop-off. lib/answers.ts has emitted these on every
            # stored answer all along; nothing has ever rendered them.
            stats['funnel_questions'] = {
                n: totals.get(f'funnel.questionnaire.q{n}', 0) for n in range(3, 36)
            }

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


def generate_report(
    target_date: Optional[datetime] = None,
) -> tuple:
    """Build the report.

    Returns (text, summary, metrics_stats). The summary is the handful of
    figures the Telegram message needs, handed over as values rather than left
    to be scraped back out of the formatted text -- see send_report.
    """
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
    # 'completions_total' was renamed to 'finished_total' when the superseded
    # sessions were split out of it. History written before that rename holds
    # the old, inflated key; averages() simply skips runs missing a key, so the
    # mean rebuilds from the new definition rather than mixing the two.
    _avg_keys = ['gate_submissions_total', 'finished_total', 'pdfs_total']
    _avgs = averages(_hist + [{
        'gate_submissions_total': q_stats.get('gate_submissions_total'),
        'finished_total': q_stats.get('finished_total'),
        'questionnaire_answers_total': q_stats.get('questionnaire_answers_total'),
        'pdfs_total': q_stats.get('pdfs_total'),
    }], _avg_keys)

    # Build report
    now_utc = datetime.now(timezone.utc)
    is_today = date_str == now_utc.strftime('%Y-%m-%d')
    span = (
        f"00:00 UTC to {now_utc.strftime('%H:%M')} UTC (day still in progress)"
        if is_today else "the whole day, 00:00 to 24:00 UTC"
    )

    report_lines = [
        f"SITE REPORT - {date_str}",
        "=" * 64,
        f"Covering {span}.",
        "",
    ] + [
        l.strip() for l in _wrap(
            "This report runs three times a day and each run restates the day "
            "so far, so the same date appears three times with rising numbers. "
            "'since last report' is the change since the previous run, not "
            "since yesterday. Under every figure is a sentence saying what it "
            "counts; where a number looks wrong, that sentence is where the "
            "explanation lives."
        )
    ] + [
        "",
        "",
    ] + heading(
        "AUDIENCE",
        "the app's own counter (fresh_audience_windows) -- integers only, "
        "no address or user agent is ever stored",
    ) + _audience_lines(audience_stats) + [
        "",
        "",
    ] + heading(
        "THE GATE",
        "the database -- durable, unaffected by deploys",
    ) + line(
        "Addresses submitted", q_stats['gate_submissions_today'],
        "People who answered both gate questions and handed over an address "
        "today. Only a SHA-256 hash and an age-encrypted copy are stored; the "
        "address itself is never written down.",
    ) + line(
        "Distinct addresses", q_stats['distinct_addresses_today'],
        "How many different addresses those submissions came from.",
    ) + line(
        "Repeat submissions", q_stats['repeat_submissions_today'],
        "Submissions from an address that had already submitted today -- "
        "usually someone who did not get the mail and tried again. Each repeat "
        "abandons the previous session; see 'Abandoned' below.",
    ) + line(
        "Gate answers stored", q_stats['gate_answers_today'],
        "Encrypted answer rows written. Two per submission is healthy: less "
        "means the gate handed back a token while dropping the answers.",
    ) + line(
        "Running total", q_stats['gate_submissions_total'],
        "Every address ever submitted, all time.",
    ) + [
        "",
        delta_line("Change since last report", q_stats['gate_submissions_today'], _prev.get('gate_submissions_today')),
        "",
        "",
    ] + heading(
        "THE QUESTIONNAIRE",
        "the database -- read the note under 'Finished' before quoting these",
    ) + line(
        "Finished today", q_stats['finished_today'],
        "Sessions that reached the end AFTER making some progress. This is the "
        "real completion count. Until 2026-08-20 this line reported ~70 a day "
        "by also counting the 'Abandoned' figure below, which is not a "
        "completion of anything.",
    ) + line(
        "Abandoned today", q_stats['superseded_today'],
        "Sessions closed without a single question answered, because the same "
        "address submitted the gate again and the newer session replaced the "
        "older one. The database marks these with the same completed_at column "
        "as a genuine finish, which is why they were conflated.",
    ) + line(
        "Still open", q_stats['in_progress'],
        "Sessions with no end stamp at all, across all time. Most are simply "
        "abandoned and will stay open until that address returns.",
    ) + line(
        "Finished, all time", q_stats['finished_total'],
        "Genuine finishes since the beginning.",
    ) + line(
        "Answers stored today", q_stats['questionnaire_answers_today'],
        "Encrypted answers written today for questions BEYOND the two gate "
        "questions -- i.e. the questionnaire proper.",
    ) + line(
        "Answers stored, all time", q_stats['questionnaire_answers_total'],
        "The same, since the beginning. If this is 0 while addresses keep "
        "arriving, nobody is getting past the gate and no 'finished' figure "
        "above can be real. It WAS 0, for every session ever recorded, until "
        "the storage path was fixed on 2026-08-21.",
    ) + line(
        "Respondents behind that", q_stats['questionnaire_answer_sessions'],
        "How many different sessions those answers came from. The line above "
        "can read 35 because one person answered a whole questionnaire and "
        "nobody else answered anything; this one cannot. Read the two "
        "together or not at all.",
    ) + [
        "",
        "",
    ] + heading(
        "DELIVERY",
        "the database",
    ) + line(
        "Magic links sent", q_stats['links_sent_today'],
        "One per gate submission. Sent means handed to the mail server, not "
        "that it reached an inbox.",
    ) + line(
        "Magic links opened", q_stats['links_used_today'],
        "How many of those were actually clicked. A low ratio means "
        "undelivered, filed as spam, or unwanted -- from here the three are "
        "indistinguishable, but a sudden drop is a delivery fault.",
    ) + (
        line(
            "PDFs delivered", q_stats['pdfs_today'],
            "Completed questionnaires mailed back as a PDF today.",
        ) + line("PDFs, all time", q_stats['pdfs_total'], "")
        if q_stats.get('pdf_note') is None
        else line("PDFs delivered", q_stats['pdf_note'],
                  "The column this counts does not exist yet, so this is not a "
                  "zero -- it is 'no answer available'.")
    ) + [
        "",
        "",
    ] + heading(
        f"AVERAGES (mean change per report, over {len(_hist)} prior runs)",
        "this script's own history file",
    ) + line(
        "Addresses / report", _fmt_avg(_avgs['gate_submissions_total']),
        "Mean rise between consecutive reports, not a daily rate: with three "
        "reports a day, multiply by roughly three for a per-day figure.",
    ) + line(
        "Finishes / report", _fmt_avg(_avgs['finished_total']), "",
    ) + line(
        "PDFs / report", _fmt_avg(_avgs['pdfs_total']),
        "'building' means fewer than two runs on record, so no change has been "
        "observed yet. It is not zero.",
    ) + [
        "",
        "",
    ] + heading(
        "NEWSLETTER",
        "the database",
    ) + line(
        "Subscribers", newsletter_stats.get('total_subscribers', 'N/A'),
        "Rows in fresh_newsletter. This table is genuinely empty -- the signup "
        "form is not wired to it yet, so zero here means 'no route in', not "
        "'nobody wanted it'.",
    ) + line(
        "Confirmed", newsletter_stats.get('confirmed_subscribers', 'N/A'),
        "Subscribers who clicked the confirmation link.",
    ) + line(
        "Pending", newsletter_stats.get('pending_subscribers', 'N/A'),
        "Signed up, not yet confirmed.",
    ) + line(
        "New today", newsletter_stats.get('new_signups_today', 'N/A'), "",
    ) + line(
        "Confirmed today", newsletter_stats.get('new_confirmed_today', 'N/A'), "",
    ) + line(
        "Legacy (archived)", newsletter_stats.get('legacy_count', 'N/A'),
        "Still-subscribed rows in the old newsletter_subscribers table, kept "
        "for history and not written to any more.",
    ) + [
        "",
        "",
    ] + heading(
        "REQUESTS",
        f"Caddy access logs, filtered to {', '.join(sorted(REPORT_HOSTS))}",
    ) + line(
        "Total requests", caddy_stats.get('total_requests', 'N/A'),
        "Every request to this site, including images, CSS and fonts.",
    ) + line(
        "Page views", caddy_stats.get('page_views', 'N/A'),
        "The same figure with static files removed. Still counts one person "
        "reading five pages as five.",
    ) + line(
        "API requests", caddy_stats.get('api_requests', 'N/A'),
        "Calls under /api/ -- the site's own front-end talking to itself.",
    ) + line(
        "Questionnaire opened", caddy_stats.get('questionnaire_views', 'N/A'),
        "Loads of /questionnaire that actually rendered a question (status "
        "200). Compare against 'Answers stored' above: opened but nothing "
        "stored means people arrive and stop.",
    ) + line(
        "Questionnaire bounced", caddy_stats.get('questionnaire_bounces', 'N/A'),
        "Arrivals at /questionnaire that were redirected to the landing page "
        "instead -- no JWT cookie, an expired one, or a session that could not "
        "be found. The respondent sees the front page and is told nothing. "
        "Until 2026-08-22 these were counted in the line above, so a bounce "
        "and an arrival were the same number.",
    ) + line(
        "Magic link worked", caddy_stats.get('verify_ok', 'N/A'),
        "Clicks on an emailed link that reached the questionnaire.",
    ) + line(
        "Magic link refused", caddy_stats.get('verify_error', 'N/A'),
        "Clicks that landed on the verification error page instead. /auth/verify "
        "renders that page with status 200 and only redirects on success, so "
        "this is exact. The usual cause is that the respondent submitted the "
        "gate again while waiting, which used to abandon the session the first "
        "link pointed at.",
    ) + line(
        "Gate posts", caddy_stats.get('gate_submissions', 'N/A'),
        "Gate submissions as Caddy saw them. This should match 'Addresses "
        "submitted' at the top; a gap means submissions failed before reaching "
        "the database.",
    ) + [
        "",
    ] + line(
        "Other sites on this box", caddy_stats.get('other_host_requests', 'N/A'),
        "Requests to unrelated sites sharing this server's access log. "
        "Excluded from every figure above; shown so that traffic never simply "
        "disappears.",
    ) + [
        f"  {'  ' + h + ':':<28}{n:>{VAL_W}}"
        for h, n in sorted(caddy_stats.get('sibling_host_requests', {}).items())
    ] + (
        _wrap("Those are our own subdomains, served from a different root, and "
              "deliberately not counted as this site.")
        if caddy_stats.get('sibling_host_requests') else []
    ) + [
        "",
        "",
    ] + heading(
        "ERRORS",
        "Caddy access logs, this site only",
    ) + line(
        "Server errors (5xx)", caddy_stats.get('errors_5xx', 0),
        "Our fault, always. Anything but 0 wants looking at.",
    ) + line(
        "Broken links (404)", caddy_stats.get('errors_404_site', 0),
        "Requests for pages that should plausibly exist -- our own dead links "
        "and mistyped paths.",
    ) + line(
        "Other 4xx", caddy_stats.get('errors_4xx_other', 0),
        "Rejected requests that were not 404s: wrong method, bad token, "
        "expired link.",
    ) + line(
        "Scanner probes (404)", caddy_stats.get('errors_404_probe', 0),
        "Automated hunts for WordPress, .env files and admin panels. Constant "
        "background noise on any public address, harmless against this site, "
        "and split out here because lumping it in made the error line look "
        "alarming every single day.",
    ) + [
        "",
        "",
    ] + heading(
        "IN-PROCESS COUNTERS",
        "/api/metrics -- RESET TO ZERO BY EVERY DEPLOY OR RESTART",
    ) + _wrap(
        "These are memory counters, not database totals. After a restart they "
        "begin again from zero, so a low number here beside a healthy figure "
        "above means the app was restarted, not that activity stopped. Where "
        "the two disagree, the database is right."
    ) + [""] + line(
        "Magic links sent", metrics_stats.get('magic_links_sent', 'N/A'), "",
    ) + line(
        "Sessions verified", metrics_stats.get('magic_links_verified', 'N/A'),
        "Magic links opened since the last restart.",
    ) + line(
        "Questionnaires started", metrics_stats.get('questionnaires_started', 'N/A'), "",
    ) + line(
        "Questionnaires completed", metrics_stats.get('questionnaires_completed', 'N/A'), "",
    ) + line(
        "Answers stored (app)", metrics_stats.get('answers_stored', 'N/A'),
        "The application's own count of encrypted answers written, against the "
        "database's figure above. They measure the same thing by different "
        "routes; if they disagree by more than a restart explains, one of them "
        "is lying and it is worth finding out which.",
    ) + line(
        "Answers that failed to store", metrics_stats.get('answers_store_failed', 'N/A'),
        "The gate refused or was unreachable. The respondent was shown their "
        "answer and asked to try again, and their place did not move.",
    ) + line(
        "Answers lost to expiry", metrics_stats.get('answers_lost_to_auth', 'N/A'),
        "Someone pressed Continue on a session that had run out. Their answer "
        "is handed back on screen to copy, but it could not be stored. This "
        "used to be a silent redirect that discarded the text unread.",
    ) + line(
        "Questions answered", metrics_stats.get('questions_answered', 'N/A'),
        "Individual answers submitted since the last restart.",
    ) + [
        "",
    ]

    # Add funnel metrics if available
    funnel = metrics_stats.get('funnel', {})
    if any(funnel.values()):
        gate_viewed = funnel.get('gate_viewed', 0)
        report_lines.extend([""] + heading(
            "CONVERSION FUNNEL",
            "/api/metrics -- same restart caveat as above",
        ) + line(
            "Gate viewed", gate_viewed,
            "The gate page was rendered.",
        ) + line(
            "Q1 answered", funnel.get('gate_q1', 0), "",
        ) + line(
            "Q2 answered", funnel.get('gate_q2', 0), "",
        ) + line(
            "Address entered", funnel.get('email_entered', 0), "",
        ) + line(
            "Completion page seen", funnel.get('completion_viewed', 0), "",
        ))
        if gate_viewed and not any(
            funnel.get(k, 0) for k in ('gate_q1', 'gate_q2', 'email_entered')
        ):
            report_lines.extend(_wrap(
                "WARNING: the gate is being viewed but none of the steps after "
                "it are incrementing. Those counters are not wired up, so this "
                "funnel cannot be read as a drop-off -- use 'Addresses "
                "submitted' at the top instead, which comes from the database."
            ))
        report_lines.append("")

    # Why people were turned away, and how many were caught by the resume token
    # rather than dumped on the landing page.
    inter = metrics_stats.get('interstitial', {})
    if any(inter.values()):
        report_lines.extend(heading(
            "TURNED AWAY",
            "/api/metrics -- same restart caveat as above",
        ) + _wrap(
            "Arrivals at a questionnaire page that could not be let straight "
            "through. Every one of these used to be a silent redirect to the "
            "front page, so none of it was visible here."
        ) + [""] + line(
            "No cookie at all", inter.get('nocookie', 0),
            "A new browser, a private window, or cookies refused.",
        ) + line(
            "Credentials run out", inter.get('expired', 0),
            "Nothing left that still authenticates.",
        ) + line(
            "Session not found", inter.get('notfound', 0),
            "Verified credentials naming a questionnaire that is gone.",
        ) + line(
            "Already finished", inter.get('finished', 0),
            "Sent on to the completion page rather than a question.",
        ) + line(
            "Rescued by resume token", inter.get('resume_redeemed', 0),
            "Arrivals whose session had expired but whose thirty-day resume "
            "token was still good, so they were let back in and given a fresh "
            "one. Before this existed every one of these was turned away.",
        ) + [""])

    # Per-question drop-off: where in the questionnaire people stop.
    fq = metrics_stats.get('funnel_questions', {})
    if any(fq.values()):
        peak = max(fq.values())
        report_lines.extend(heading(
            "WHERE PEOPLE STOP",
            "/api/metrics -- same restart caveat as above",
        ) + _wrap(
            "Answers stored at each position, 3 through 35. Counted since the "
            "last restart, not since midnight, so read the SHAPE and not the "
            "totals: a cliff at one number is a question people will not "
            "answer, and a smooth decline is ordinary attrition."
        ) + [""] + [
            f"  {('q' + str(n)):<6}{('#' * max(1, (v * 40) // peak)) if v else '':<41}{v:>5}"
            for n, v in sorted(fq.items()) if v
        ] + [""])

    # Add engagement depth (latency buckets)
    latency = metrics_stats.get('latency', {})
    total_responses = sum(latency.values())
    if total_responses > 0:
        report_lines.extend([""] + heading(
            "TIME TAKEN PER ANSWER",
            "/api/metrics -- same restart caveat as above",
        ) + _wrap(
            "How long people sat with each question before answering. Buckets, "
            "not an average, so one very long pause cannot skew it."
        ) + [""] + [
            f"  {'Under 30s':<28}{latency.get('fast', 0):>{VAL_W}}  ({latency.get('fast', 0)*100//total_responses:>2}%)",
            f"  {'30s to 2m':<28}{latency.get('moderate', 0):>{VAL_W}}  ({latency.get('moderate', 0)*100//total_responses:>2}%)",
            f"  {'2m to 5m':<28}{latency.get('thoughtful', 0):>{VAL_W}}  ({latency.get('thoughtful', 0)*100//total_responses:>2}%)",
            f"  {'Over 5m':<28}{latency.get('extended', 0):>{VAL_W}}  ({latency.get('extended', 0)*100//total_responses:>2}%)",
            "",
        ])

    # Add feature usage
    features = metrics_stats.get('features', {})
    if any(features.values()):
        report_lines.extend([""] + heading(
            "FEATURE USAGE",
            "/api/metrics -- same restart caveat as above",
        ) + line(
            "Skip used", features.get('skip_used', 0),
            "Times a reader passed on a question rather than answering it.",
        ) + line(
            "Newsletter CTA clicked", features.get('newsletter_cta', 0), "",
        ) + [""])

    # Add top paths
    if caddy_stats.get('top_paths'):
        report_lines.extend([""] + heading(
            "MOST-REQUESTED PAGES",
            "Caddy access logs, static files excluded",
        ))
        for path, count in list(caddy_stats['top_paths'].items())[:8]:
            report_lines.append(f"  {count:>6}  {path}")
        report_lines.append("")

    # Add hourly traffic if available
    if caddy_stats.get('hourly_traffic'):
        report_lines.extend([""] + heading(
            "REQUESTS BY HOUR (UTC)",
            "Caddy access logs, this site only",
        ))
        hourly = caddy_stats['hourly_traffic']
        max_traffic = max(hourly.values()) if hourly else 1
        for hour in range(24):
            count = hourly.get(hour, 0)
            bar_len = int(20 * count / max_traffic) if max_traffic > 0 else 0
            report_lines.append(f"  {hour:02d}:00 | {count:>5} {'#' * bar_len}")
        if is_today and now_utc.hour < 23:
            report_lines.extend(_wrap(
                "Hours after the time at the top of this report are empty "
                "because they have not happened yet, not because traffic "
                "stopped."
            ))
        report_lines.append("")

    # Add data source notes
    report_lines.extend([
        "",
        "-" * 64,
        "SOURCES",
        f"  Caddy logs      {'OK' if not caddy_stats.get('error') else caddy_stats.get('error')}"
        f"  ({caddy_stats.get('files_read', 0)} file(s) read)",
        f"  /api/metrics    {'OK' if not metrics_stats.get('error') else metrics_stats.get('error')}",
        f"  Database        {'OK' if not newsletter_stats.get('error') else newsletter_stats.get('error')}",
        "",
        "Generated " + now_utc.strftime('%Y-%m-%d %H:%M:%S UTC') + " on aformulationoftruth.com",
    ])

    # Record this run so the next report can show the change since it, and so
    # the averages have another data point. Written last: a failure to persist
    # must not cost us the report itself.
    append_history({
        'at': datetime.now(timezone.utc).isoformat(),
        'date': target_date.strftime('%Y-%m-%d'),
        'gate_submissions_today': q_stats.get('gate_submissions_today'),
        'gate_submissions_total': q_stats.get('gate_submissions_total'),
        'distinct_addresses_today': q_stats.get('distinct_addresses_today'),
        'finished_today': q_stats.get('finished_today'),
        'finished_total': q_stats.get('finished_total'),
        'superseded_today': q_stats.get('superseded_today'),
        'links_sent_today': q_stats.get('links_sent_today'),
        'links_used_today': q_stats.get('links_used_today'),
        'pdfs_today': q_stats.get('pdfs_today'),
        'pdfs_total': q_stats.get('pdfs_total'),
        'newsletter_total': newsletter_stats.get('total_subscribers'),
    })

    summary = {
        'visitors': audience_stats.get('visitors') if audience_stats.get('available') else None,
        'addresses': q_stats.get('gate_submissions_today'),
        'distinct': q_stats.get('distinct_addresses_today'),
        'finished': q_stats.get('finished_today'),
        'abandoned': q_stats.get('superseded_today'),
        'windows_complete': (
            audience_stats.get('windows') >= audience_stats.get('expected_windows')
            if audience_stats.get('available') else False
        ),
    }

    return "\n".join(report_lines), summary, metrics_stats


def send_report(
    report: str,
    target_date: datetime,
    metrics_stats: Optional[Dict] = None,
    summary: Optional[Dict[str, Any]] = None,
) -> None:
    """Send the report via all configured channels.

    The Telegram summary is built from values passed in, not scraped back out
    of the formatted mail. The old version searched the rendered text for
    'Total Signups:' -- a label the report has never contained -- so the
    subscriber figure in every Telegram message was 'N/A', and 'New Today:'
    matched whichever section happened to use that wording first. Re-parsing
    your own output couples the summary to the layout; any rewording breaks it
    silently.
    """
    date_str = target_date.strftime('%Y-%m-%d')
    summary = summary or {}

    def _s(key: str) -> str:
        v = summary.get(key)
        return 'N/A' if v is None else str(v)

    # Funnel and engagement, where the in-process counters have anything to say.
    funnel_summary = ""
    engagement_summary = ""
    if metrics_stats:
        latency = metrics_stats.get('latency', {})
        thoughtful = latency.get('thoughtful', 0) + latency.get('extended', 0)
        total_responses = sum(latency.values())
        if total_responses > 0:
            deep_pct = (thoughtful / total_responses) * 100
            engagement_summary = (
                f"\n🧘 Answers taking over 2 minutes: <b>{deep_pct:.0f}%</b> "
                f"({thoughtful} of {total_responses})"
            )

    # Gate conversion from the DATABASE, not the funnel counters -- the funnel's
    # post-view steps do not increment, so a ratio built on them read 0.0% on
    # days when a hundred people submitted the gate.
    people = summary.get('visitors')
    addresses = summary.get('addresses')
    if isinstance(people, int) and isinstance(addresses, int) and people > 0:
        if addresses > people or not summary.get('windows_complete', True):
            # The audience counter is a ceiling on people, so a ratio over 100%
            # is not a triumph -- it means the counter missed part of the day
            # (it started mid-day, or the app restarted). Printing "709%" once
            # is enough to teach a reader to distrust the whole message.
            funnel_summary = (
                "\n📈 Gate conversion: <b>not computable</b> — the audience "
                "counter did not cover the whole day"
            )
        else:
            funnel_summary = (
                f"\n📈 Gate conversion: <b>{addresses * 100 / people:.0f}%</b> "
                f"at least ({addresses} addresses, at most {people} people)"
            )

    telegram_msg = f"""🙏 <b>namaste / நமஸ்தே</b>

📊 <b>Site report / தள அறிக்கை - {date_str}</b>

👥 People (upper bound): <b>{_s('visitors')}</b>

✉️ Addresses today: <b>{_s('addresses')}</b> ({_s('distinct')} distinct)

📝 Questionnaires finished: <b>{_s('finished')}</b>
🚪 Sessions abandoned: <b>{_s('abandoned')}</b>{funnel_summary}{engagement_summary}

<i>Full report, with what each figure means, by email</i>
<i>முழு அறிக்கை மின்னஞ்சலில்</i>

— a formulation of truth —"""

    send_telegram_message(telegram_msg)

    subject = f"Site report / தள அறிக்கை - {date_str}"
    email_body = f"""🙏 namaste / நமஸ்தே

{report}

— a formulation of truth —
"""
    send_email_report(subject, email_body)


def main():
    """Generate and send the site report."""
    logger.info("=" * 50)
    logger.info("A Formulation of Truth - Site Report")
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

    # generate_report already fetched /api/metrics; main used to fetch it a
    # SECOND time for the Telegram summary, so the mail and the message could
    # disagree whenever a deploy landed between the two calls.
    report, summary, metrics_stats = generate_report(target_date)
    print(report)
    print()

    send_report(report, target_date, metrics_stats, summary)
    logger.info("Report generation complete")


if __name__ == '__main__':
    main()
