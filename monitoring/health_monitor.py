#!/usr/bin/env python3
"""
Health Monitor for A Formulation of Truth

Monitors service health and sends alerts via Email (SendGrid) and Telegram.
Checks:
- Fresh API health endpoint
- Gate service availability
- Database connectivity (via health endpoint)
- 5xx error rates (via metrics endpoint)

Privacy: No PII is logged or transmitted. Only aggregate status information.

Environment Variables Required:
- TELEGRAM_BOT_TOKEN: Telegram bot API token
- TELEGRAM_CHAT_ID: Chat ID to send alerts to
- SENDGRID_API_KEY: SendGrid API key for email alerts
- ALERT_EMAIL: Email address to receive alerts
- SENDGRID_FROM_EMAIL: Sender email address
"""

import os
import sys
import json
import time
import socket
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
from urllib.parse import urlencode

# Configure logging - NO PII, aggregate metrics only
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

# Configuration from environment
CONFIG = {
    'telegram_token': os.environ.get('TELEGRAM_BOT_TOKEN', ''),
    'telegram_chat_id': os.environ.get('TELEGRAM_CHAT_ID', ''),
    'sendgrid_api_key': os.environ.get('SENDGRID_API_KEY', ''),
    'alert_email': os.environ.get('ALERT_EMAIL', 'nyagrodha@icloud.com'),
    'from_email': os.environ.get('SENDGRID_FROM_EMAIL', 'formitselfisemptiness@aformulationoftruth.com'),
    'check_interval': int(os.environ.get('CHECK_INTERVAL', '60')),  # seconds
    'failure_threshold': int(os.environ.get('FAILURE_THRESHOLD', '3')),  # consecutive failures before alert
    'error_rate_threshold': float(os.environ.get('ERROR_RATE_THRESHOLD', '0.1')),  # 10% error rate
}

# Service endpoints to monitor
SERVICES = {
    'fresh_api': {
        'name': 'Fresh API',
        'url': 'http://localhost:8393/api/health',
        'expected_status': 200,
        'timeout': 10,
    },
    'gate_service': {
        'name': 'Gate Service',
        'url': 'http://localhost:8787/',
        'expected_status': 200,
        'timeout': 10,
    },
    'fresh_api_vpn': {
        'name': 'Fresh API (VPN)',
        'url': 'http://10.67.0.1:7781/api/health',
        'expected_status': 200,
        'timeout': 15,
        'optional': True,  # Don't alert if VPN service is down (fallback exists)
    },
    'metrics': {
        'name': 'Metrics Endpoint',
        'url': 'http://localhost:8393/api/metrics',
        'expected_status': 200,
        'timeout': 10,
    },
}

# Track service states
service_states: Dict[str, Dict[str, Any]] = {}


def send_telegram_alert(message: str) -> bool:
    """Send alert via Telegram bot."""
    if not CONFIG['telegram_token'] or not CONFIG['telegram_chat_id']:
        logger.warning("Telegram credentials not configured, skipping Telegram alert")
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
            if result.get('ok'):
                logger.info("Telegram alert sent successfully")
                return True
            else:
                logger.error(f"Telegram API error: {result}")
                return False
    except Exception as e:
        logger.error(f"Failed to send Telegram alert: {e}")
        return False


def send_email_alert(subject: str, body: str) -> bool:
    """Send alert via SendGrid API."""
    if not CONFIG['sendgrid_api_key']:
        logger.warning("SendGrid API key not configured, skipping email alert")
        return False

    try:
        url = "https://api.sendgrid.com/v3/mail/send"
        payload = {
            "personalizations": [{
                "to": [{"email": CONFIG['alert_email']}]
            }],
            "from": {
                "email": CONFIG['from_email'],
                "name": "A Formulation of Truth Monitor"
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
            if response.status in [200, 202]:
                logger.info("Email alert sent successfully")
                return True
            else:
                logger.error(f"SendGrid API returned status {response.status}")
                return False
    except HTTPError as e:
        logger.error(f"SendGrid API error: {e.code} - {e.read().decode('utf-8', errors='ignore')[:200]}")
        return False
    except Exception as e:
        logger.error(f"Failed to send email alert: {e}")
        return False


def send_alert(title: str, message: str, severity: str = "warning") -> None:
    """Send alert via all configured channels."""
    timestamp = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')
    emoji = "🔴" if severity == "critical" else "⚠️" if severity == "warning" else "✅"

    # Telegram message
    telegram_msg = f"{emoji} <b>{title}</b>\n\n{message}\n\n<i>Timestamp: {timestamp}</i>"
    send_telegram_alert(telegram_msg)

    # Email
    email_subject = f"[{severity.upper()}] {title}"
    email_body = f"{title}\n\n{message}\n\nTimestamp: {timestamp}\n\nServer: aformulationoftruth.com"
    send_email_alert(email_subject, email_body)


def check_service(service_id: str, service_config: dict) -> Dict[str, Any]:
    """Check a single service health."""
    result = {
        'service_id': service_id,
        'name': service_config['name'],
        'status': 'unknown',
        'response_time_ms': None,
        'error': None,
        'timestamp': datetime.now(timezone.utc).isoformat(),
    }

    try:
        start_time = time.time()
        req = Request(service_config['url'], method='GET')

        with urlopen(req, timeout=service_config['timeout']) as response:
            response_time = (time.time() - start_time) * 1000
            result['response_time_ms'] = round(response_time, 2)

            if response.status == service_config['expected_status']:
                result['status'] = 'healthy'

                # For health endpoints, try to parse the response
                if 'health' in service_config['url']:
                    try:
                        data = json.loads(response.read().decode('utf-8'))
                        if data.get('status') == 'degraded':
                            result['status'] = 'degraded'
                            result['error'] = data.get('message', 'Service degraded')
                    except:
                        pass
            else:
                result['status'] = 'unhealthy'
                result['error'] = f"Unexpected status code: {response.status}"

    except HTTPError as e:
        result['status'] = 'unhealthy'
        result['error'] = f"HTTP {e.code}"
    except URLError as e:
        result['status'] = 'down'
        result['error'] = f"Connection failed: {e.reason}"
    except socket.timeout:
        result['status'] = 'timeout'
        result['error'] = f"Timeout after {service_config['timeout']}s"
    except Exception as e:
        result['status'] = 'error'
        result['error'] = str(e)

    return result


def check_error_rates() -> Dict[str, Any]:
    """Check error rates from metrics endpoint."""
    result = {
        'status': 'unknown',
        'error_rate_5xx': None,
        'total_requests': 0,
        'error_count_5xx': 0,
    }

    try:
        req = Request('http://localhost:8393/api/metrics', method='GET')
        with urlopen(req, timeout=10) as response:
            data = json.loads(response.read().decode('utf-8'))

            current = data.get('currentHour', {})
            total_requests = current.get('requests.total', 0) + current.get('requests.api', 0)
            errors_5xx = current.get('errors.5xx', 0)

            result['total_requests'] = total_requests
            result['error_count_5xx'] = errors_5xx

            if total_requests > 0:
                error_rate = errors_5xx / total_requests
                result['error_rate_5xx'] = round(error_rate, 4)
                result['status'] = 'high_errors' if error_rate > CONFIG['error_rate_threshold'] else 'normal'
            else:
                result['status'] = 'no_traffic'

    except Exception as e:
        result['status'] = 'check_failed'
        result['error'] = str(e)

    return result


def process_health_check(service_id: str, result: Dict[str, Any], service_config: dict) -> None:
    """Process health check result and send alerts if needed."""
    # Initialize state tracking
    if service_id not in service_states:
        service_states[service_id] = {
            'consecutive_failures': 0,
            'last_alert_time': None,
            'last_status': 'unknown',
        }

    state = service_states[service_id]
    is_healthy = result['status'] in ['healthy']
    is_optional = service_config.get('optional', False)

    if is_healthy:
        # Service recovered
        if state['consecutive_failures'] >= CONFIG['failure_threshold']:
            send_alert(
                f"Service Recovered: {result['name']}",
                f"Service is now healthy.\nResponse time: {result['response_time_ms']}ms",
                severity="info"
            )
        state['consecutive_failures'] = 0
        state['last_status'] = 'healthy'
    else:
        state['consecutive_failures'] += 1
        state['last_status'] = result['status']

        # Alert after threshold failures (skip optional services)
        if state['consecutive_failures'] == CONFIG['failure_threshold'] and not is_optional:
            send_alert(
                f"Service Down: {result['name']}",
                f"Status: {result['status']}\nError: {result['error']}\nConsecutive failures: {state['consecutive_failures']}",
                severity="critical"
            )


def run_health_checks() -> None:
    """Run all health checks."""
    logger.info("Running health checks...")

    for service_id, service_config in SERVICES.items():
        result = check_service(service_id, service_config)
        logger.info(f"  {result['name']}: {result['status']} ({result['response_time_ms']}ms)")
        process_health_check(service_id, result, service_config)

    # Check error rates
    error_check = check_error_rates()
    if error_check['status'] == 'high_errors':
        send_alert(
            "High Error Rate Detected",
            f"5xx error rate: {error_check['error_rate_5xx']*100:.1f}%\nTotal requests: {error_check['total_requests']}\n5xx errors: {error_check['error_count_5xx']}",
            severity="warning"
        )


def main():
    """Main monitoring loop."""
    logger.info("=" * 50)
    logger.info("A Formulation of Truth - Health Monitor")
    logger.info("=" * 50)
    logger.info(f"Check interval: {CONFIG['check_interval']}s")
    logger.info(f"Failure threshold: {CONFIG['failure_threshold']} consecutive failures")
    logger.info(f"Telegram configured: {'Yes' if CONFIG['telegram_token'] else 'No'}")
    logger.info(f"SendGrid configured: {'Yes' if CONFIG['sendgrid_api_key'] else 'No'}")
    logger.info("=" * 50)

    # Initial health check
    run_health_checks()

    # Continuous monitoring loop
    while True:
        time.sleep(CONFIG['check_interval'])
        try:
            run_health_checks()
        except Exception as e:
            logger.error(f"Health check error: {e}")


if __name__ == '__main__':
    main()
