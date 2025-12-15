#!/bin/bash

################################################################################
# A Formulation of Truth - Health Monitoring Script
#
# This script monitors the health of all services and infrastructure:
# - Backend API service (a4mula.service)
# - Docker containers (frontend, backend, tor, vpn, keycloak)
# - Caddy web server
# - PostgreSQL database
# - Network ports
# - HTTP endpoints
#
# It only sends email alerts when the warning level RISES (not on every check)
# to avoid alert fatigue.
################################################################################

# Configuration
STATE_FILE="/tmp/a4mula-health-state.txt"
ADMIN_EMAIL="halahalamohashantaye@icloud.com"
SITE_URL="https://aformulationoftruth.com"
API_URL="https://aformulationoftruth.com/api/ping"
BACKEND_PORT=8393

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Load SMTP credentials from .env files (try both root and backend)
for env_file in /home/marcel/aformulationoftruth/.env /home/marcel/aformulationoftruth/backend/.env; do
    if [ -f "$env_file" ]; then
        source <(grep -E '^(SMTP_HOST|SMTP_PORT|SMTP_USER|SMTP_PASS|FROM_EMAIL|FROM_NAME)=' "$env_file" | sed 's/^/export /')
    fi
done

# Initialize counters
CRITICAL_COUNT=0
WARNING_COUNT=0
OK_COUNT=0

# Array to store all issues
declare -a ISSUES=()
declare -a WARNINGS=()

# Function to add critical issue
add_critical() {
    CRITICAL_COUNT=$((CRITICAL_COUNT + 1))
    ISSUES+=("❌ CRITICAL: $1")
    echo -e "${RED}❌ CRITICAL: $1${NC}"
}

# Function to add warning
add_warning() {
    WARNING_COUNT=$((WARNING_COUNT + 1))
    WARNINGS+=("⚠️  WARNING: $1")
    echo -e "${YELLOW}⚠️  WARNING: $1${NC}"
}

# Function to add success
add_ok() {
    OK_COUNT=$((OK_COUNT + 1))
    echo -e "${GREEN}✓ $1${NC}"
}

# Function to send email alert using Python and SMTP
send_email_alert() {
    local subject="$1"
    local body="$2"

    if [ -z "$SMTP_HOST" ] || [ -z "$SMTP_USER" ] || [ -z "$SMTP_PASS" ]; then
        echo "Cannot send email: SMTP credentials not configured"
        return 1
    fi

    python3 - <<EOF
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import sys

try:
    msg = MIMEMultipart()
    msg['From'] = "${FROM_EMAIL:-formitselfisemptiness@aformulationoftruth.com}"
    msg['To'] = "${ADMIN_EMAIL}"
    msg['Subject'] = "${subject}"

    body_text = """${body}"""
    msg.attach(MIMEText(body_text, 'plain'))

    server = smtplib.SMTP("${SMTP_HOST}", ${SMTP_PORT:-587})
    server.starttls()
    server.login("${SMTP_USER}", "${SMTP_PASS}")
    server.send_message(msg)
    server.quit()

    print("Email sent successfully")
    sys.exit(0)
except Exception as e:
    print(f"Failed to send email: {e}", file=sys.stderr)
    sys.exit(1)
EOF
}

# Function to calculate current warning level
calculate_warning_level() {
    if [ $CRITICAL_COUNT -gt 0 ]; then
        echo "CRITICAL"
    elif [ $WARNING_COUNT -gt 0 ]; then
        echo "WARNING"
    else
        echo "OK"
    fi
}

# Function to read previous state
read_previous_state() {
    if [ -f "$STATE_FILE" ]; then
        cat "$STATE_FILE"
    else
        echo "UNKNOWN"
    fi
}

# Function to save current state
save_current_state() {
    echo "$1" > "$STATE_FILE"
}

################################################################################
# Health Checks
################################################################################

echo "════════════════════════════════════════════════════════════════════"
echo "Health Check: $(date '+%Y-%m-%d %H:%M:%S')"
echo "════════════════════════════════════════════════════════════════════"
echo ""

# 1. Check Backend Service (a4mula.service)
echo "━━━ Backend Service (a4mula) ━━━"
if systemctl is-active --quiet a4mula.service; then
    add_ok "Backend service (a4mula) is running"
else
    add_critical "Backend service (a4mula) is NOT running"
fi

# Check if backend is listening on port
if ss -tlnp 2>/dev/null | grep -q ":${BACKEND_PORT} "; then
    add_ok "Backend listening on port ${BACKEND_PORT}"
else
    add_critical "Backend NOT listening on port ${BACKEND_PORT}"
fi

# 2. Check Docker Containers
echo ""
echo "━━━ Docker Containers ━━━"

# Check if docker is running
if ! systemctl is-active --quiet docker; then
    add_critical "Docker service is NOT running"
else
    add_ok "Docker service is running"

    # Check individual containers
    containers=("karuppacami-frontend" "karuppacami-backend" "pyazopay" "wg-easy" "the_bums_win")
    for container in "${containers[@]}"; do
        if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
            # Check health status
            health_status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "none")
            if [ "$health_status" = "healthy" ] || [ "$health_status" = "none" ]; then
                add_ok "Container ${container} is running (health: ${health_status})"
            elif [ "$health_status" = "unhealthy" ]; then
                add_warning "Container ${container} is running but UNHEALTHY"
            fi
        else
            add_warning "Container ${container} is NOT running"
        fi
    done
fi

# 3. Check Caddy Web Server
echo ""
echo "━━━ Caddy Web Server ━━━"
if systemctl is-active --quiet caddy.service; then
    add_ok "Caddy web server is running"
else
    add_critical "Caddy web server is NOT running"
fi

# Check if Caddy is listening on ports 80 and 443
if ss -tlnp 2>/dev/null | grep -q ":80 "; then
    add_ok "Caddy listening on port 80 (HTTP)"
else
    add_warning "Caddy NOT listening on port 80"
fi

if ss -tlnp 2>/dev/null | grep -q ":443 "; then
    add_ok "Caddy listening on port 443 (HTTPS)"
else
    add_critical "Caddy NOT listening on port 443"
fi

# 4. Check Database Connection
echo ""
echo "━━━ Database Connection ━━━"
if [ -f /home/marcel/aformulationoftruth/backend/.env ]; then
    source <(grep '^DATABASE_URL=' /home/marcel/aformulationoftruth/backend/.env | sed 's/^/export /')

    if [ -n "$DATABASE_URL" ]; then
        # Try to connect to database using psql
        if echo "SELECT 1;" | psql "$DATABASE_URL" -qt >/dev/null 2>&1; then
            add_ok "Database connection successful"
        else
            add_critical "Database connection FAILED"
        fi
    else
        add_warning "DATABASE_URL not set in .env"
    fi
fi

# 5. Check HTTP Endpoints
echo ""
echo "━━━ HTTP Endpoints ━━━"

# Check main site
http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$SITE_URL" 2>/dev/null || echo "000")
if [ "$http_code" = "200" ] || [ "$http_code" = "301" ] || [ "$http_code" = "302" ]; then
    add_ok "Main site responding (HTTP $http_code)"
else
    add_critical "Main site NOT responding (HTTP $http_code)"
fi

# Check API endpoint
api_http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$API_URL" 2>/dev/null || echo "000")
if [ "$api_http_code" = "200" ]; then
    add_ok "API endpoint responding (HTTP $api_http_code)"
else
    add_critical "API endpoint NOT responding (HTTP $api_http_code)"
fi

# 6. Check SSL Certificate
echo ""
echo "━━━ SSL Certificate ━━━"
cert_days=$(echo | openssl s_client -servername aformulationoftruth.com -connect aformulationoftruth.com:443 2>/dev/null | openssl x509 -noout -dates 2>/dev/null | grep "notAfter" | cut -d= -f2 | xargs -I {} date -d "{}" +%s 2>/dev/null || echo "0")
current_time=$(date +%s)
days_until_expiry=$(( (cert_days - current_time) / 86400 ))

if [ "$days_until_expiry" -gt 30 ]; then
    add_ok "SSL certificate valid (${days_until_expiry} days remaining)"
elif [ "$days_until_expiry" -gt 7 ]; then
    add_warning "SSL certificate expiring soon (${days_until_expiry} days remaining)"
elif [ "$days_until_expiry" -gt 0 ]; then
    add_critical "SSL certificate expiring VERY soon (${days_until_expiry} days remaining)"
else
    add_critical "SSL certificate EXPIRED or check failed"
fi

# 7. Check System Resources
echo ""
echo "━━━ System Resources ━━━"

# Check disk space
disk_usage=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$disk_usage" -lt 80 ]; then
    add_ok "Disk usage: ${disk_usage}%"
elif [ "$disk_usage" -lt 90 ]; then
    add_warning "Disk usage high: ${disk_usage}%"
else
    add_critical "Disk usage CRITICAL: ${disk_usage}%"
fi

# Check memory usage
mem_usage=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100}')
if [ "$mem_usage" -lt 80 ]; then
    add_ok "Memory usage: ${mem_usage}%"
elif [ "$mem_usage" -lt 90 ]; then
    add_warning "Memory usage high: ${mem_usage}%"
else
    add_critical "Memory usage CRITICAL: ${mem_usage}%"
fi

# 8. Check Environment Variables
echo ""
echo "━━━ Environment Configuration ━━━"
required_env_vars=("DATABASE_URL" "JWT_SECRET" "SMTP_HOST" "SMTP_USER")
for env_var in "${required_env_vars[@]}"; do
    if grep -q "^${env_var}=" /home/marcel/aformulationoftruth/backend/.env 2>/dev/null; then
        value=$(grep "^${env_var}=" /home/marcel/aformulationoftruth/backend/.env | cut -d= -f2)
        if [ -n "$value" ]; then
            add_ok "Env var ${env_var} is set"
        else
            add_warning "Env var ${env_var} is empty"
        fi
    else
        add_warning "Env var ${env_var} is NOT set"
    fi
done

################################################################################
# Summary and Email Alert
################################################################################

echo ""
echo "════════════════════════════════════════════════════════════════════"
echo "Summary:"
echo "  ✓ OK:       $OK_COUNT"
echo "  ⚠ Warning:  $WARNING_COUNT"
echo "  ❌ Critical: $CRITICAL_COUNT"
echo "════════════════════════════════════════════════════════════════════"

# Calculate current and previous warning levels
CURRENT_LEVEL=$(calculate_warning_level)
PREVIOUS_LEVEL=$(read_previous_state)

echo ""
echo "Status: $PREVIOUS_LEVEL → $CURRENT_LEVEL"

# Determine if we should send an alert (only when level rises)
SHOULD_ALERT=false

if [ "$PREVIOUS_LEVEL" = "OK" ] && [ "$CURRENT_LEVEL" != "OK" ]; then
    SHOULD_ALERT=true
elif [ "$PREVIOUS_LEVEL" = "WARNING" ] && [ "$CURRENT_LEVEL" = "CRITICAL" ]; then
    SHOULD_ALERT=true
elif [ "$PREVIOUS_LEVEL" = "UNKNOWN" ] && [ "$CURRENT_LEVEL" != "OK" ]; then
    SHOULD_ALERT=true
fi

# Send email alert if warning level has risen
if [ "$SHOULD_ALERT" = true ]; then
    echo ""
    echo "⚠️  Warning level has RISEN: $PREVIOUS_LEVEL → $CURRENT_LEVEL"
    echo "📧 Sending email alert to $ADMIN_EMAIL..."

    # Build email body
    EMAIL_BODY="A Formulation of Truth - Health Monitor Alert

Warning level has RISEN: $PREVIOUS_LEVEL → $CURRENT_LEVEL
Time: $(date '+%Y-%m-%d %H:%M:%S')

════════════════════════════════════════════════════════════════

SUMMARY:
  ✓ OK:       $OK_COUNT
  ⚠ Warning:  $WARNING_COUNT
  ❌ Critical: $CRITICAL_COUNT

════════════════════════════════════════════════════════════════

"

    if [ ${#ISSUES[@]} -gt 0 ]; then
        EMAIL_BODY+="CRITICAL ISSUES:
"
        for issue in "${ISSUES[@]}"; do
            EMAIL_BODY+="$issue
"
        done
        EMAIL_BODY+="
"
    fi

    if [ ${#WARNINGS[@]} -gt 0 ]; then
        EMAIL_BODY+="WARNINGS:
"
        for warning in "${WARNINGS[@]}"; do
            EMAIL_BODY+="$warning
"
        done
        EMAIL_BODY+="
"
    fi

    EMAIL_BODY+="════════════════════════════════════════════════════════════════

This is an automated alert from the A Formulation of Truth health monitoring system.
To investigate, SSH to the server and run:
  sudo systemctl status a4mula
  docker ps -a
  sudo journalctl -u a4mula -n 50
"

    send_email_alert "🚨 A4M Health Alert: $CURRENT_LEVEL" "$EMAIL_BODY"

    if [ $? -eq 0 ]; then
        echo "✓ Email sent successfully"
    else
        echo "✗ Failed to send email"
    fi
else
    echo ""
    echo "No alert sent (warning level has not risen)"
fi

# Save current state for next check
save_current_state "$CURRENT_LEVEL"

# Exit with appropriate code
if [ $CRITICAL_COUNT -gt 0 ]; then
    exit 2
elif [ $WARNING_COUNT -gt 0 ]; then
    exit 1
else
    exit 0
fi
