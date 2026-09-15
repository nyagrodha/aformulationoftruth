#!/usr/bin/env python3
"""
Site Report for A Formulation of Truth

Runs three times a day and restates the day so far, with what changed since
the previous run.

The mail opens with a verdict -- six lines that say whether the gate took
addresses, whether links went out and were opened, whether the key box signed
anything, whether the counter was up -- and only then shows the tables it was
drawn from. That order was earned: on 26 and 27 August the site accepted
ninety six addresses and sent seventy magic links, and the twenty six people
who got nothing back were invisible because the two figures sat five screens
apart with nothing subtracting one from the other.

Sources, and why any figure ever disagrees with another:

  the database        durable, unaffected by deploys, and the figure to
                      believe whenever it disagrees with a counter
  the app's counters   /api/metrics, held in memory and zeroed by every
                      restart; the only source for things that leave no row,
                      such as a refusal or a key box failure
  fresh_audience_windows   integer visitor counts, no address or user agent
                      ever stored
  Caddy access logs   requests the app may never have handled

On what is counted and what is not: a figure is here if a plausible reading of
it would change what someone does next. Counts that could only ever be zero
were removed rather than explained -- eight of the keys this report used to
read are emitted by nothing in the application, and rendered as reassuring
zeros in sections about failures. Four more were read under a prefix
(funnel.interstitial.*) that the app has never emitted while the real counters
sat one name away under auth.session.*.

Notes under a figure are now the exception. They appear where the name invites
a wrong reading -- "completions" that are abandonments, a ceiling that is not a
tally -- or where the figure is saying something today that its label does not.
Prose that never changes is prose nobody rereads, and there were a hundred and
fifty lines of it burying the four numbers that had moved.

Sends the report via Email (SMTP) and Telegram.

Privacy: aggregate counts only. No addresses, user agents or PII are read into
the report or written to its history file. Logs are read and discarded.

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

# Column at which every value is right-aligned, and the rule width. One rule
# width for the whole mail: mixed widths read as mixed sections.
RULE_W = 64
LABEL_W = 30

# How deep a note under a figure is indented.
_NOTE_INDENT = ' ' * 4


def line(label: str, value: Any, note: str = '') -> List[str]:
    """One figure: label, right-aligned value, and a note only when needed.

    The note used to be mandatory on every figure. Three runs a day of fifty
    figures meant a hundred and fifty lines of prose that never changed, and
    prose that never changes is prose nobody rereads -- it buried the four or
    five numbers that had actually moved.

    A note now earns its place one of two ways: the figure's plain name invites
    a wrong reading ("completions" that are abandonments), or the figure is
    saying something today that its name does not. Everything else stands on
    its label. What each section counts is stated once, in the section header.
    """
    out = [f"  {label:<{LABEL_W}}{str(value):>{VAL_W}}"]
    if note:
        out.extend(_wrap(note, indent=_NOTE_INDENT))
    return out


def rate(label: str, num: Any, den: Any, note: str = '') -> List[str]:
    """A figure and the proportion it is of another, on one line.

    Counts alone cannot answer the question this report exists to answer.
    "Magic links opened: 5" is unreadable without the 28 it came from; as
    "5 of 28 (18%)" it is a verdict. Where a denominator exists, it is shown.
    """
    n, d = _num(num), _num(den)
    if n is None or d is None or d == 0:
        return line(label, num if n is not None else 'n/a', note)
    out = [f"  {label:<{LABEL_W}}{str(num):>{VAL_W}}   of {int(d)} ({int(n * 100 // d)}%)"]
    if note:
        out.extend(_wrap(note, indent=_NOTE_INDENT))
    return out


def _wrap(text: str, width: int = RULE_W, indent: str = _NOTE_INDENT) -> List[str]:
    """Wrap prose to the rule width, breaking only between words.

    Width is measured including the indent, so a wrapped note ends where the
    rule above it ends instead of stopping short of it or running past.
    """
    limit = max(20, width - len(indent))
    words, cur, out = text.split(), '', []
    for w in words:
        if cur and len(cur) + 1 + len(w) > limit:
            out.append(indent + cur)
            cur = w
        else:
            cur = f"{cur} {w}".strip()
    if cur:
        out.append(indent + cur)
    return out


def heading(title: str, source: str) -> List[str]:
    """A section title, a rule, and one line naming where the numbers come from.

    Four sources feed this mail and they disagree by design -- the database is
    durable, /api/metrics resets on deploy, Caddy sees requests the app never
    handled. A section whose provenance is unstated invites the reader to
    reconcile figures that were never meant to match.

    The source sits BELOW the rule, wrapped to the same width. It used to sit
    between the title and the rule, wrapped to 60, which broke headers
    mid-phrase -- "RESET TO ZERO BY EVERY DEPLOY OR / RESTART".
    """
    return [title.upper(), "-" * RULE_W, *_wrap(source, indent='  '), ""]


def plural(n: Any, one: str, many: str = '') -> str:
    """'1 answer', '2 answers' -- a verdict line reading '1 answers' invites
    the reader to distrust the arithmetic behind it."""
    return f"{n} {one if _num(n) == 1 else (many or one + 's')}"


_VERDICT_COL = 2 + 5 + 15  # two spaces, "[ok] ", then the label column


def verdict(label: str, ok: bool, detail: str) -> List[str]:
    """One entry in the status block: a mark, what was checked, and the reading.

    Wraps with a hanging indent rather than truncating. An earlier version cut
    the line at the rule and mailed "the app's counters cover onl", which is
    the exact failure this rewrite set out to remove.
    """
    head = f"  [{'ok' if ok else '!!'}] {label:<15}"
    wrapped = _wrap(detail, indent=' ' * _VERDICT_COL)
    wrapped[0] = head + wrapped[0][_VERDICT_COL:]
    return wrapped


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
    # while the gate still hands back a token.
    v = _psql(f"SELECT COUNT(*) FROM gate_encrypted_answers WHERE created_at::date = '{d}'")
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


def get_messenger_stats(target_date: datetime) -> Dict[str, Any]:
    """Enrolment and traffic for the sealed messenger, from the database.

    The messenger shipped with eighteen counters and no report line. Counters
    alone could not answer the only question worth asking of a feature this
    new -- has anyone enrolled at all -- because they reset on every deploy,
    and a feature with two users looks exactly like a feature with none once
    the service restarts. These four numbers are durable.

    Aggregates only: no address hash, no ciphertext, no thread membership.
    """
    d = target_date.strftime('%Y-%m-%d')
    st: Dict[str, Any] = {
        'identities': 'N/A', 'threads': 'N/A',
        'messages_total': 'N/A', 'messages_today': 'N/A', 'unread': 'N/A',
    }
    v = _psql("SELECT COUNT(*) FROM messenger_identities")
    if v is not None and v.isdigit():
        st['identities'] = int(v)
    v = _psql("SELECT COUNT(*) FROM messenger_threads")
    if v is not None and v.isdigit():
        st['threads'] = int(v)
    v = _psql(
        "SELECT COUNT(*), "
        f"COUNT(*) FILTER (WHERE created_at::date = '{d}'), "
        "COUNT(*) FILTER (WHERE read_at IS NULL) FROM messenger_messages"
    )
    if v and v.count('|') == 2:
        st['messages_total'], st['messages_today'], st['unread'] = (
            int(x) for x in v.split('|')
        )
    return st


def health(q: Dict[str, Any], caddy: Dict[str, Any],
           m: Dict[str, Any], avgs: Dict[str, Optional[float]]) -> Dict[str, Any]:
    """The figures nobody was computing, from figures everybody was reading.

    Every number below was already in the mail, in a different section, as a
    raw count. Set eighty lines apart from the thing it should be compared
    against, a count cannot show a failure: on 26 and 27 August, 58 and 38
    addresses reached the database and 42 and 28 magic links went out. Twenty
    six people handed over an address and got nothing back. Both figures were
    printed, correctly, in sections five screens apart, and the loss was
    invisible because no line subtracted one from the other.

    So: subtract them here, and put the result at the top.
    """
    out: Dict[str, Any] = {}

    posts, rows = _num(caddy.get('gate_submissions_ok')), _num(q.get('gate_submissions_today'))
    out['posts_lost'] = int(posts - rows) if posts is not None and rows is not None and posts > rows else 0

    sent, used = _num(q.get('links_sent_today')), _num(q.get('links_used_today'))
    out['links_unsent'] = int(rows - sent) if rows is not None and sent is not None and rows > sent else 0
    out['open_rate'] = int(used * 100 // sent) if sent else None
    # Everyone who submitted successfully and heard nothing back, however the
    # path broke: storage, or delivery, or both.
    out['heard_nothing'] = (
        int(posts - sent) if posts is not None and sent is not None and posts > sent else 0
    )

    # Against the trailing mean the report already keeps but never compared
    # anything to. A zero day only means something next to a normal one.
    mean = avgs.get('gate_submissions_total')
    out['expected'] = mean
    out['quiet'] = bool(mean and mean >= 5 and (rows or 0) == 0)

    out['keybox_failed'] = m.get('keybox_failed', 0)
    out['gate_rejected'] = (m.get('gate_rejected', 0) or 0) + (m.get('gate_unreachable', 0) or 0)
    return out


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
    """One row: the value now, and how it moved since the previous run."""
    cur = _num(current)
    if cur is None:
        return f"  {label:<{LABEL_W}}{str(current):>{width}}"
    prev = _num(previous)
    if prev is None:
        return f"  {label:<{LABEL_W}}{current:>{width}}   (first run on record)"
    d = cur - prev
    if d == 0:
        return f"  {label:<{LABEL_W}}{current:>{width}}   (unchanged)"
    return f"  {label:<{LABEL_W}}{current:>{width}}   ({d:+g})"


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


def _coverage_lines(a: Dict[str, Any]) -> List[str]:
    """The "was the counter up" figure, closed windows against closed windows.

    Kept apart from _audience_lines because the honest reading changes shape
    before 04:00 UTC, when no window has closed and a ratio would be 0 / 0 --
    a number that looks like a fault and is not one.
    """
    expected = a.get('expected_windows', 0)
    if expected == 0:
        return line(
            "Windows recorded", "none closed yet",
            "Today's first window closes at 04:00 UTC. The figures above come "
            "from the window still open.",
        )
    return line(
        "Windows recorded", f"{a['windows']} / {expected}",
        "Closed 4-hour windows against those that have closed; the open one "
        "is excluded from both sides. Short means the counter was down for a "
        "whole window."
        if a['windows'] < expected else "",
    )


def _audience_verdict(a: Dict[str, Any]) -> str:
    """One line for the status block at the top."""
    if not a.get('available'):
        return "counter unreachable"
    if not a.get('any_rows'):
        return "recorder not running, no windows at all"
    w, e = a.get('windows'), a.get('expected_windows')
    short = f", {e - w} window(s) missing" if w is not None and e and w < e else ""
    return f"{a['visitors']} at most, {a['bot_visitors']} previews{short}"


def _audience_lines(a: Dict[str, Any]) -> List[str]:
    """The audience section, or a fault. A silent 0 is how the old counter hid."""
    if not a.get('available'):
        return ["  Counter unreachable: could not read fresh_audience_windows."]
    if not a.get('any_rows'):
        return _wrap(
            "Recorder not running: no windows recorded at all. One row per "
            "4-hour window is expected, so this is the counter being down "
            "rather than nobody coming. Requests below are unaffected.",
            indent='  ')

    out = line(
        "People, at most", a['visitors'],
        "Distinct visitors per 4-hour window, summed. Someone returning in a "
        "later window is counted twice, so this is a ceiling and never a "
        "tally of unique people.",
    ) + line(
        "Link previews", a['bot_visitors'],
        "Crawlers and chat apps fetching preview cards, excluded from the "
        "figure above.",
    ) + _coverage_lines(a)

    if a.get('split_windows'):
        out.extend(line(
            "Windows split by a restart", a['split_windows'],
            "The app restarted mid-window and began counting from empty, so "
            "the ceiling above is inflated by an unrecoverable amount.",
        ))
    if a.get('truncated'):
        out.extend(_wrap(
            "A window hit its 200,000 cap, so today's figure is a floor "
            "rather than the usual ceiling."))
    return out


def get_audience_stats(target_date: datetime) -> Dict[str, Any]:
    """Visitor counts from the app-side counter (fresh_audience_windows).

    Two questions are asked of one table and they need different scopes.

    The FIGURES -- people, previews, requests -- are about this site, so they
    stay filtered to site='a4t'. COVERAGE, meaning "was the counter running",
    is a property of the process, and the process counts every host it serves:
    a four-hour stretch in which only gimbal.fobdongle.com was hit is a window
    the counter recorded, not a hole in it. Coverage is therefore asked across
    all sites, and a quiet stretch on a4t no longer reads as an outage.

    Coverage counts CLOSED windows, on both sides of the comparison. The report
    runs at 08:00 UTC, which is itself a window boundary: the window opening at
    that instant has no row yet -- the app's flush timer reaches it up to a
    minute later -- so counting it as expected made the morning report accuse a
    healthy counter of having stopped every single day, and, through
    windows_complete, drop the Telegram gate-conversion line along with it.
    Closed against closed, and the boundary stops mattering.
    """
    day = target_date.strftime('%Y-%m-%d')
    span_end = (target_date + timedelta(days=1)).strftime('%Y-%m-%d') + 'T00:00:00+00'
    now = datetime.now(timezone.utc)

    # Cutoff = the start of the window still open, so `window_start < cutoff`
    # is exactly the set of closed windows. A finished day has none open.
    if day == now.strftime('%Y-%m-%d'):
        expected = now.hour // 4
        cutoff = f"{day}T{expected * 4:02d}:00:00+00"
    else:
        expected = 6
        cutoff = span_end

    row = _psql(
        "SELECT COALESCE(SUM(visitors) FILTER (WHERE site='a4t'),0), "
        "COALESCE(SUM(bot_visitors) FILTER (WHERE site='a4t'),0), "
        "COALESCE(SUM(requests) FILTER (WHERE site='a4t'),0), "
        "COALESCE(BOOL_OR(truncated) FILTER (WHERE site='a4t'),false), "
        f"COUNT(DISTINCT window_start) FILTER (WHERE window_start < '{cutoff}'), "
        "COUNT(DISTINCT run_id), "
        # run_id is part of the primary key, so a restart ADDS a row for the
        # window it lands in rather than replacing one. The excess of a4t rows
        # over a4t windows is therefore the number of windows whose People
        # figure was counted twice from an empty set.
        "COUNT(*) FILTER (WHERE site='a4t') "
        "  - COUNT(DISTINCT window_start) FILTER (WHERE site='a4t'), "
        "COUNT(*) "
        "FROM fresh_audience_windows WHERE "
        f"window_start >= '{day}T00:00:00+00' AND window_start < '{span_end}'"
    )
    if not row:
        return {'available': False}
    v, b, r, trunc, windows, runs, split, rows = (row.split('|') + [''] * 8)[:8]

    return {
        'available': True,
        'visitors': int(v or 0),
        'bot_visitors': int(b or 0),
        'requests': int(r or 0),
        'truncated': (trunc or 'f') == 't',
        'windows': int(windows or 0),
        'runs': int(runs or 0),
        'split_windows': int(split or 0),
        # Any row at all, the open window included. The "not running" fault
        # keys on this rather than on closed-window coverage, which is
        # legitimately zero on every report run before 04:00 UTC.
        'any_rows': int(rows or 0) > 0,
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
        'gate_submissions_ok': 0,
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
                                # Only a post the handler ACCEPTED should
                                # have produced a database row. Counting
                                # every post, as this did until 2026-08-29,
                                # charges validation failures and aborted
                                # connections (status 0) to the site as lost
                                # data. The gate answers 303 on success.
                                if 200 <= status < 400:
                                    stats['gate_submissions_ok'] += 1

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
                # answers.stored / answers.store_failed / answers.lost_to_auth
                # were read here and are emitted by nothing -- a grep of the
                # app finds them only in this file. They rendered three
                # permanent zeros that read as "nothing failed" when they meant
                # "nothing was measured". The database answers the same
                # question durably, so they are gone rather than reinstated.
                #
                # The gate's own storage verdict, which has no database
                # equivalent: a refusal leaves no row to count.
                'gate_stored': totals.get('gate.encrypt.stored', 0),
                'gate_rejected': totals.get('gate.encrypt.rejected', 0),
                'gate_unreachable': totals.get('gate.encrypt.unreachable', 0),
                # The PDF path. pdf_delivered_at can only ever show what
                # succeeded; every failure lives here and nowhere else.
                'keybox_failed': totals.get('keybox.withdraw_failed', 0),
                'delivery_pushed': totals.get('delivery.pushed', 0),
                'delivery_declined': totals.get('delivery.declined', 0),
                'delivery_keybox_unavailable': totals.get('delivery.keybox_unavailable', 0),
            })

            # The messenger, shipped with no reporting at all. Eighteen
            # counters are emitted and none has ever been read.
            stats['messenger'] = {
                'sent': totals.get('messenger.sent', 0),
                'threads': totals.get('messenger.thread.created', 0),
                'enrolled': totals.get('messenger.identity.created', 0),
                'blocked': totals.get('messenger.blocked', 0),
                'denied_unproven': totals.get('messenger.denied.unproven', 0)
                                   + totals.get('messenger.page.unproven', 0),
                'denied_unauth': totals.get('messenger.denied.unauthenticated', 0)
                                 + totals.get('messenger.page.unauthenticated', 0),
                'denied_rate': totals.get('messenger.denied.rate_limited', 0)
                               + totals.get('messenger.rejected.rate_limited', 0),
                'rejected_other': totals.get('messenger.rejected.oversize', 0)
                                  + totals.get('messenger.rejected.no_recipient_key', 0)
                                  + totals.get('messenger.rejected.blocked', 0),
            }

            # Why people were turned away from a questionnaire route. Before
            # these existed the same situations produced a bare redirect to the
            # landing page, indistinguishable in the logs from ordinary traffic.
            # These read funnel.interstitial.* until 2026-08-29, a prefix the
            # app has never emitted, so the whole section rendered zeros while
            # the real counters sat one name away under auth.session.*.
            stats['interstitial'] = {
                'nocookie': totals.get('auth.session.nocookie', 0),
                'expired': totals.get('auth.session.expired', 0),
                'notfound': totals.get('auth.session.notfound', 0),
                'claimless': totals.get('auth.session.claimless', 0),
                'resume_redeemed': totals.get('auth.resume.redeemed', 0),
                'resume_stale': totals.get('auth.resume.stale', 0),
            }

            # Per-question drop-off. lib/answers.ts has emitted these on every
            # stored answer all along; nothing has ever rendered them.
            stats['funnel_questions'] = {
                n: totals.get(f'funnel.questionnaire.q{n}', 0) for n in range(3, 36)
            }

            # The gate funnel, reduced to the three stages that are actually
            # instrumented. funnel.gate.email_entered and
            # funnel.completion.viewed appear only in doc comments and the
            # client-side increment allowlist -- nothing calls them, so the
            # old five-line funnel ended in two structural zeros and printed a
            # warning telling the reader to ignore it. A section that has to
            # disclaim itself should not be sent.
            stats['funnel'] = {
                'gate_viewed': totals.get('funnel.gate.viewed', 0),
                'gate_q1': totals.get('funnel.gate.q1_answered', 0),
                'gate_q2': totals.get('funnel.gate.q2_answered', 0),
            }

            # Latency buckets (engagement depth)
            stats['latency'] = {
                'fast': totals.get('latency.fast', 0),
                'moderate': totals.get('latency.moderate', 0),
                'thoughtful': totals.get('latency.thoughtful', 0),
                'extended': totals.get('latency.extended', 0),
            }

            # feature.newsletter.cta_clicked is emitted by nothing, which
            # left this section a single real figure -- folded into the
            # questionnaire section rather than kept as a header of its own.
            stats['features'] = {
                'skip_used': totals.get('feature.skip_used', 0),
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
    msg_stats = get_messenger_stats(target_date)

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
        f"00:00 to {now_utc.strftime('%H:%M')} UTC, still in progress"
        if is_today else "00:00 to 24:00 UTC, complete"
    )
    h = health(q_stats, caddy_stats, metrics_stats, _avgs)

    # ── the verdict, before any table ──────────────────────────────────────
    #
    # The old report opened with the audience count and reached delivery on
    # the fourth screen. Every figure in it was correct on 27 August and it
    # still could not say that the site had taken thirty eight addresses and
    # sent twenty eight links, because saying so required holding two numbers
    # from two sections in your head. These six lines do that arithmetic and
    # put the answer first. Everything below is now evidence for it, which is
    # the right order for a mail read three times a day.
    checks: List[str] = []
    if h['quiet']:
        checks.extend(verdict(
            "Gate", False,
            f"none today; {h['expected']:.0f} is the usual per run"))
    else:
        checks.extend(verdict(
            "Gate", h['posts_lost'] == 0,
            plural(q_stats['gate_submissions_today'], 'address', 'addresses')
            + (f", {plural(h['posts_lost'], 'post')} unstored" if h['posts_lost'] else "")))
    checks.extend(verdict(
        "Delivery", h['heard_nothing'] == 0,
        plural(q_stats['links_sent_today'], 'link') + " sent"
        + (f", {h['heard_nothing']} submissions got none back"
           if h['heard_nothing'] else "")
        + (f", {h['open_rate']}% opened" if h['open_rate'] is not None else "")))
    checks.extend(verdict(
        "Questionnaire", True,
        f"{q_stats['finished_today']} finished, "
        + plural(q_stats['questionnaire_answers_today'], 'answer')))
    if is_today:
        checks.extend(verdict(
            "PDF return", not h['keybox_failed'],
            plural(h['keybox_failed'], 'signing') + " failed at the key box"
            if h['keybox_failed'] else f"{q_stats.get('pdfs_today', 0)} sent"))
        checks.extend(verdict(
            "Server errors", not caddy_stats.get('errors_5xx', 0) and not h['keybox_failed'],
            f"{caddy_stats.get('errors_5xx', 0)} in the log, "
            f"{metrics_stats.get('errors_5xx', 0)} in the app"))
    else:
        checks.extend(verdict(
            "PDF return", True, f"{q_stats.get('pdfs_today', 0)} sent"))
        checks.extend(verdict(
            "Server errors", not caddy_stats.get('errors_5xx', 0),
            f"{caddy_stats.get('errors_5xx', 0)} in the log"))
    checks.extend(verdict(
        "Audience", audience_stats.get('available', False),
        _audience_verdict(audience_stats)))

    report_lines = [
        f"SITE REPORT   {date_str}   {span}",
        "=" * RULE_W,
        "",
    ] + checks + [
        "",
    ] + _wrap(
        "Three runs a day, each restating the day so far. Changes are since "
        "the previous run, not since yesterday.", indent='  '
    ) + [
        "",
        "",
    ] + heading(
        "The gate and the questionnaire",
        "the database, which survives deploys and is the figure to believe "
        "wherever the counters below disagree with it",
    ) + line(
        "Addresses submitted", q_stats['gate_submissions_today'],
    ) + line(
        "From distinct addresses", q_stats['distinct_addresses_today'],
        "The rest are repeats, usually because the first mail never arrived. "
        "Each repeat abandons the session before it."
        if _num(q_stats.get('repeat_submissions_today')) else "",
    ) + rate(
        "Gate answers stored", q_stats['gate_answers_today'],
        (_num(q_stats['gate_submissions_today']) or 0) * 2,
        "Two encrypted rows per submission is the healthy shape. Short means "
        "the encryption path is dropping answers while the gate still hands "
        "back a token."
        if _num(q_stats['gate_answers_today']) is not None
        and _num(q_stats['gate_answers_today']) < (_num(q_stats['gate_submissions_today']) or 0) * 2
        else "",
    ) + [
        "",
        delta_line("Change since last report", q_stats['gate_submissions_today'],
                   _prev.get('gate_submissions_today')),
        "",
    ] + line(
        "Finished today", q_stats['finished_today'],
        "Reached the end having answered something. Sessions closed at "
        "question zero are abandonments and are counted on the next line, "
        "not here.",
    ) + line(
        "Abandoned today", q_stats['superseded_today'],
    ) + line(
        "Answers stored today", q_stats['questionnaire_answers_today'],
        "Beyond the two gate questions. Zero while addresses keep arriving "
        "means nobody is getting past the gate."
        if not _num(q_stats.get('questionnaire_answers_today'))
        and _num(q_stats.get('gate_submissions_today')) else "",
    ) + line(
        "Questions skipped", metrics_stats.get('features', {}).get('skip_used', 'N/A'),
    ) + [
        "",
    ] + line(
        "Still open, all time", q_stats['in_progress'],
        "No end stamp. Most are abandoned and stay open until that address "
        "returns.",
    ) + line(
        "Finished, all time", q_stats['finished_total'],
    ) + line(
        "Answers stored, all time", q_stats['questionnaire_answers_total'],
    ) + line(
        "Respondents behind them", q_stats['questionnaire_answer_sessions'],
        "Thirty-five answers may be one person; this line says which.",
    ) + [
        "",
        "",
    ] + heading(
        "Delivery",
        "the database for what was sent and opened, the app's counters for "
        "what failed -- a refusal leaves no row to count",
    ) + line(
        "Magic links sent", q_stats['links_sent_today'],
        f"{h['heard_nothing']} accepted submissions produced no link at all: "
        f"{h['posts_lost']} were never stored and {h['links_unsent']} were "
        "stored without one being sent. Those people handed over an address "
        "and got nothing back."
        if h['heard_nothing'] else "",
    ) + rate(
        "Magic links opened", q_stats['links_used_today'], q_stats['links_sent_today'],
        "Unopened covers undelivered, filed as spam, and unwanted alike -- "
        "the three are indistinguishable from here. A collapse in the "
        "proportion is not.",
    ) + (
        line("PDFs returned today", q_stats['pdfs_today'])
        + line("PDFs returned, all time", q_stats['pdfs_total'])
        if q_stats.get('pdf_note') is None
        else line("PDFs returned", q_stats['pdf_note'],
                  "The column does not exist yet. Not a zero.")
    ) + line(
        "Key box withdrawals failed", metrics_stats.get('keybox_failed', 'N/A'),
        "The key box is what signs the returned PDF, so this is the ceiling "
        "on PDFs that can be sent. It is also, today, every server error the "
        "app reported."
        if _num(metrics_stats.get('keybox_failed')) else "",
    ) + line(
        "Gate refused or unreachable", h['gate_rejected'],
        "The encryption service turned an answer away. The answer was handed "
        "back and the reader's place held."
        if h['gate_rejected'] else "",
    ) + [
        "",
        "",
    ] + heading(
        "Messenger",
        "the database. New enough that the only question worth asking is "
        "whether anyone has enrolled",
    ) + line(
        "Identities enrolled", msg_stats['identities'],
        "Nobody has generated a key pair yet, so no message can be sent to "
        "anyone. Every figure below is a zero for that reason and not "
        "another."
        if msg_stats.get('identities') == 0 else "",
    ) + line(
        "Threads open", msg_stats['threads'],
    ) + line(
        "Messages today", msg_stats['messages_today'],
    ) + line(
        "Messages unread", msg_stats['unread'],
    ) + (
        line("Turned away at the door",
             (metrics_stats.get('messenger', {}).get('denied_unproven', 0)
              + metrics_stats.get('messenger', {}).get('denied_unauth', 0)),
             "Arrivals at the messenger without a finished questionnaire or "
             "without a session. The gate is one completed questionnaire.")
        if any(metrics_stats.get('messenger', {}).values()) else []
    ) + [
        "",
        "",
    ] + heading(
        "Audience",
        "the app's own counter -- integers only, no address or user agent is "
        "ever stored",
    ) + _audience_lines(audience_stats) + ([
        "",
        *_wrap("Every figure below this point that comes from the app's "
               "counters describes the last 24 hours, not the date above: "
               "the counters hold no history and cannot be asked about a "
               "past day.", indent='  '),
    ] if not is_today else []) + [
        "",
        "",
    ] + heading(
        "Requests",
        f"Caddy access logs, this site only ({', '.join(sorted(REPORT_HOSTS))})",
    ) + line(
        "Requests", caddy_stats.get('total_requests', 'N/A'),
    ) + rate(
        "Automated", caddy_stats.get('errors_404_probe', 0),
        caddy_stats.get('total_requests'),
        "Scanners hunting WordPress installs, .env files and admin panels. "
        "Split out because at this share it otherwise sets the shape of every "
        "figure below it, including the hourly chart.",
    ) + line(
        "Questionnaire opened", caddy_stats.get('questionnaire_views', 'N/A'),
    ) + line(
        "Questionnaire bounced", caddy_stats.get('questionnaire_bounces', 'N/A'),
        "Redirected to the landing page instead: no cookie, an expired one, "
        "or a missing session. They are told nothing.",
    ) + rate(
        "Magic link clicks that worked", caddy_stats.get('verify_ok', 'N/A'),
        (_num(caddy_stats.get('verify_ok')) or 0) + (_num(caddy_stats.get('verify_error')) or 0),
    ) + line(
        "Gate posts accepted", caddy_stats.get('gate_submissions_ok', 'N/A'),
        f"{h['posts_lost']} of these never became a row in the database. The "
        "gate answered each of them 303, so those people were told their "
        "answers had been taken."
        if h['posts_lost'] else "",
    ) + line(
        "Gate posts refused or dropped",
        int((_num(caddy_stats.get('gate_submissions')) or 0)
            - (_num(caddy_stats.get('gate_submissions_ok')) or 0)),
        "Rejected by the handler or abandoned mid-request. These are "
        "correctly absent from the database and are not counted as loss.",
    ) + [
        "",
    ] + line(
        "Server errors (5xx)", caddy_stats.get('errors_5xx', 0),
        "Our fault, always. Anything but zero wants looking at.",
    ) + line(
        "Broken links (404)", caddy_stats.get('errors_404_site', 0),
        "Our own dead links and mistyped paths, scanner probes excluded.",
    ) + line(
        "Refused (other 4xx)", caddy_stats.get('errors_4xx_other', 0),
        "Wrong method, bad token, expired link.",
    ) + [
        "",
        "",
    ] + heading(
        "Newsletter",
        "the database. The signup form is not wired to it, so these cannot "
        "yet be anything but zero",
    ) + line(
        "Subscribers, confirmed / total",
        f"{newsletter_stats.get('confirmed_subscribers', 'N/A')}"
        f" / {newsletter_stats.get('total_subscribers', 'N/A')}",
    ) + [
        "",
        "",
    ] + heading(
        f"Averages over {len(_hist)} prior runs",
        "this script's own history file",
    ) + line(
        "Addresses per report", _fmt_avg(_avgs['gate_submissions_total']),
        "Mean rise between consecutive runs. Multiply by three for a daily "
        "rate. This is the figure the status block calls the usual.",
    ) + line(
        "Finishes per report", _fmt_avg(_avgs['finished_total']),
    ) + line(
        "PDFs per report", _fmt_avg(_avgs['pdfs_total']),
        "'building' means fewer than two runs on record, not zero.",
    ) + [
        "",
    ]

    # Why arrivals could not be let straight through. These read
    # funnel.interstitial.* until 2026-08-29 -- a prefix nothing emits -- so
    # the section was five zeros. The counters were always there under
    # auth.session.*.
    inter = metrics_stats.get('interstitial', {})
    if any(inter.values()):
        report_lines.extend([""] + heading(
            "Turned away",
            "the app's counters, which reset on every deploy",
        ) + line(
            "No cookie at all", inter.get('nocookie', 0),
            "A new browser, a private window, or cookies refused.",
        ) + line(
            "Credentials run out", inter.get('expired', 0),
        ) + line(
            "Session not found", inter.get('notfound', 0),
            "Valid credentials naming a questionnaire that is gone.",
        ) + line(
            "Session without a claim", inter.get('claimless', 0),
        ) + line(
            "Rescued by resume token", inter.get('resume_redeemed', 0),
            "Expired sessions whose thirty-day token still held, let back in "
            "with fresh credentials.",
        ) + line(
            "Resume token too old", inter.get('resume_stale', 0),
        ) + [""])

    # Per-question drop-off.
    fq = metrics_stats.get('funnel_questions', {})
    if any(fq.values()):
        peak = max(fq.values())
        report_lines.extend([""] + heading(
            "Where people stop",
            "the app's counters, which reset on every deploy. Read the shape, "
            "not the totals: a cliff is a question people refuse, a slope is "
            "ordinary attrition",
        ) + [
            f"  {('q' + str(n)):<6}{('#' * max(1, (v * 40) // peak)):<41}{v:>5}"
            for n, v in sorted(fq.items()) if v
        ] + [""])

    # Time per answer.
    latency = metrics_stats.get('latency', {})
    total_responses = sum(latency.values())
    if total_responses > 0:
        report_lines.extend([""] + heading(
            "Time taken per answer",
            "the app's counters. Buckets rather than an average, so one long "
            "pause cannot skew it",
        ) + [
            f"  {lbl:<{LABEL_W}}{latency.get(k, 0):>{VAL_W}}"
            f"   ({latency.get(k, 0) * 100 // total_responses}%)"
            for lbl, k in (
                ('Under 30s', 'fast'), ('30s to 2m', 'moderate'),
                ('2m to 5m', 'thoughtful'), ('Over 5m', 'extended'),
            )
        ] + [""])

    # Most-requested pages.
    if caddy_stats.get('top_paths'):
        report_lines.extend([""] + heading(
            "Most-requested pages",
            "Caddy access logs, static files excluded",
        ) + [
            f"  {count:>6}  {path}"
            for path, count in list(caddy_stats['top_paths'].items())[:8]
        ] + [""])

    # Requests by hour. Hours that have not happened are no longer printed as
    # zero rows with a note explaining that they are not really zero -- there
    # were thirteen of them in an 8am report, and a chart that is half
    # disclaimer is not a chart.
    if caddy_stats.get('hourly_traffic'):
        hourly = caddy_stats['hourly_traffic']
        last = now_utc.hour if is_today else 23
        peak = max([hourly.get(x, 0) for x in range(last + 1)] or [1]) or 1
        report_lines.extend([""] + heading(
            "Requests by hour (UTC)",
            "Caddy access logs, this site only",
        ) + [
            f"  {hour:02d}  {'#' * int(20 * hourly.get(hour, 0) / peak):<20} "
            f"{hourly.get(hour, 0):>5}"
            for hour in range(last + 1)
        ] + [""])

    # Add data source notes
    report_lines.extend([
        "",
        "-" * RULE_W,
        f"  Caddy logs     {'ok' if not caddy_stats.get('error') else caddy_stats.get('error')}"
        f", {caddy_stats.get('files_read', 0)} file(s)",
        f"  App counters   {'ok' if not metrics_stats.get('error') else metrics_stats.get('error')}",
        f"  Database       {'ok' if not newsletter_stats.get('error') else newsletter_stats.get('error')}",
        "",
        "  Generated " + now_utc.strftime('%Y-%m-%d %H:%M UTC')
        + " on aformulationoftruth.com",
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
        'questionnaire_answers_today': q_stats.get('questionnaire_answers_today'),
        'posts_lost': h.get('posts_lost'),
        'links_unsent': h.get('links_unsent'),
        'heard_nothing': h.get('heard_nothing'),
        'open_rate': h.get('open_rate'),
        'keybox_failed': h.get('keybox_failed'),
        'messenger_identities': msg_stats.get('identities'),
    })

    summary = {
        'visitors': audience_stats.get('visitors') if audience_stats.get('available') else None,
        'addresses': q_stats.get('gate_submissions_today'),
        'distinct': q_stats.get('distinct_addresses_today'),
        'finished': q_stats.get('finished_today'),
        'abandoned': q_stats.get('superseded_today'),
        'answers': q_stats.get('questionnaire_answers_today'),
        # The faults worth waking someone for. Telegram is the channel read on
        # a phone, so it carries the verdict and not the tables.
        'faults': [f for f in (
            f"{h['posts_lost']} gate posts never stored" if h['posts_lost'] else None,
            f"{h['heard_nothing']} submissions got nothing back" if h['heard_nothing'] else None,
            f"{h['keybox_failed']} key box failures"
            if h['keybox_failed'] and is_today else None,
            f"no addresses today, {h['expected']:.0f} is usual" if h['quiet'] else None,
        ) if f],
        'open_rate': h.get('open_rate'),
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

    # Faults first. A phone message is read in the time it takes to glance at
    # it, so anything wrong has to be in the first line or it is not read at
    # all -- the day the gate lost twenty six submissions, this message opened
    # with the visitor count.
    faults = summary.get('faults') or []
    fault_block = (
        "\n".join(f"‼️ {f}" for f in faults) + "\n\n" if faults else "✅ nothing amiss\n\n"
    )
    opened = summary.get('open_rate')
    delivery = (
        f"\n📨 Magic links opened: <b>{opened}%</b>" if opened is not None else ""
    )

    telegram_msg = f"""🙏 <b>namaste / நமஸ்தே</b>

📊 <b>Site report / தள அறிக்கை - {date_str}</b>

{fault_block}✉️ Addresses today: <b>{_s('addresses')}</b> ({_s('distinct')} distinct){delivery}

📝 Finished: <b>{_s('finished')}</b>  ·  abandoned: <b>{_s('abandoned')}</b>
✍️ Answers stored: <b>{_s('answers')}</b>

👥 People, at most: <b>{_s('visitors')}</b>{funnel_summary}{engagement_summary}

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
