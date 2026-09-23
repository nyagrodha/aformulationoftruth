"""Small, aggregate-only display snapshot, published by the existing mail job."""

import json
import os
import math
import tempfile
from datetime import datetime, time, timedelta, timezone
from pathlib import Path
from urllib.request import urlopen

SCHEDULE = (time(8), time(18), time(23, 15))  # Live timer: Atlantic/Reykjavik (UTC).
WEATHER_URL = ('https://api.open-meteo.com/v1/forecast?latitude=64.1466&longitude=-21.9426'
               '&current=temperature_2m,apparent_temperature,wind_speed_10m,weather_code'
               '&wind_speed_unit=ms&timezone=UTC&forecast_days=1')


def weather_sentence(data):
    current = data['current']
    temp, feels, wind = (current[k] for k in ('temperature_2m', 'apparent_temperature', 'wind_speed_10m'))
    if not all(type(n) in (float, int) and math.isfinite(n) for n in (temp, feels, wind)):
        raise ValueError('Missing weather measurements')
    stamp = datetime.fromisoformat(current['time']).replace(tzinfo=timezone.utc)
    if abs((datetime.now(timezone.utc) - stamp).total_seconds()) > 3 * 3600:
        raise ValueError('Weather data too old')
    code = current['weather_code']
    if type(code) is not int:
        raise ValueError('Missing weather condition')
    condition = ('Clear' if code == 0 else 'Partly cloudy' if code in (1, 2) else
                 'Overcast' if code == 3 else 'Foggy' if code in (45, 48) else
                 'Drizzle' if code in (51, 53, 55, 56, 57) else
                 'Rain' if code in (61, 63, 65, 66, 67, 80, 81, 82) else
                 'Snow' if code in (71, 73, 75, 77, 85, 86) else
                 'Thunderstorms' if code in (95, 96, 99) else 'Conditions unknown')
    return (f'{condition}, {temp:g} C. Feels like {feels:g} C.\nWind {wind:g} m/s.\n'
            f'Open-Meteo model, {stamp:%H:%M} UTC.')


def fetch_weather():
    try:
        with urlopen(WEATHER_URL, timeout=10) as response:
            body = response.read(16385)
        if len(body) > 16384:
            raise ValueError('Weather response too large')
        return weather_sentence(json.loads(body))
    except Exception:
        return 'Reykjavik weather unavailable. The next report will try again.'


def next_report(now):
    now = now.astimezone(timezone.utc)
    for clock in SCHEDULE:
        candidate = datetime.combine(now.date(), clock, timezone.utc)
        if candidate > now:
            return candidate
    return datetime.combine(now.date() + timedelta(days=1), SCHEDULE[0], timezone.utc)


def count_sentence(value, singular, plural):
    if type(value) is not int or value < 0:
        return singular.capitalize() + " count unavailable."
    return f"{value:,} {singular if value == 1 else plural}."


def snapshot(summary, target_date, email_sent, now=None, weather=None):
    now = now or datetime.now(timezone.utc)
    source = summary.get('display_sources', {})
    activity = "\n".join((
        count_sentence(summary.get('addresses'), 'gate submission', 'gate submissions'),
        count_sentence(summary.get('finished'), 'questionnaire finished', 'questionnaires finished'),
        count_sentence(summary.get('answers'), 'answer stored', 'answers stored'),
    ))
    faults = summary.get('faults') or []
    if faults:
        delivery = '. '.join(str(f) for f in faults) + '.'
    elif not source.get('health_available', False):
        delivery = 'Some health checks are unavailable. See the email report.'
    else:
        delivery = 'No report faults detected.'
    opened = summary.get('open_rate')
    if type(opened) in (int, float) and 0 <= opened <= 100:
        delivery += f'\n{opened:g}% of magic links opened.'

    visitors = summary.get('visitors')
    if not source.get('audience_available') or not source.get('audience_rows') or type(visitors) is not int:
        audience = 'Visitor count unavailable.'
    elif source.get('audience_truncated'):
        audience = f'At least {visitors:,} visitor-window counts; a counting limit was reached.'
    else:
        audience = f'{visitors:,} visitor-window counts. Returning people may be counted again.'
    if not summary.get('windows_complete', False):
        audience += '\nCounting coverage is incomplete.'
    if source.get('audience_split'):
        audience += '\nA restart may inflate this count.'

    pages = [activity, delivery, audience, weather or 'Reykjavik weather unavailable.']
    # The fixed board buffer leaves room for a terminator; no raw report text is exported.
    pages = [p.encode('ascii', 'replace').decode() for p in pages]
    pages = [p if len(p) <= 240 else p[:213].rsplit(' ', 1)[0] + '... See email for details.' for p in pages]
    due = next_report(now)
    return {
        'version': 1,
        'generated': int(now.timestamp()),
        'expires': int((due + timedelta(minutes=10)).timestamp()),
        'date': target_date.strftime('%Y-%m-%d'),
        'updated': now.strftime('%d %b %H:%M UTC'),
        'email': 'sent' if email_sent is True else 'failed' if email_sent is False else 'preview',
        'pages': pages,
    }


def publish(summary, target_date, email_sent, *, path=None, now=None):
    path = Path(path or os.environ.get('E290_REPORT_PATH', '/var/lib/a4t-e290/latest.json'))
    data = snapshot(summary, target_date, email_sent, now, fetch_weather())
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix='.report-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(data, stream, ensure_ascii=True, separators=(',', ':'))
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(temp, 0o644)
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)
    return data
