# A Formulation of Truth - Infrastructure & Services Report

**Generated:** 2025-12-10
**Author:** Infrastructure Analysis System

---

## Executive Summary

This report documents all services, servers, environment variables, and monitoring systems that make **aformulationoftruth.com** operational. It includes failsafe mechanisms to prevent service startup without essential configuration, and a comprehensive health monitoring system that sends email alerts when issues are detected.

---

## Table of Contents

1. [Services Architecture](#services-architecture)
2. [Essential Environment Variables](#essential-environment-variables)
3. [Service Breakdown](#service-breakdown)
4. [Network Architecture](#network-architecture)
5. [Failsafe Mechanisms](#failsafe-mechanisms)
6. [Health Monitoring System](#health-monitoring-system)
7. [Troubleshooting Guide](#troubleshooting-guide)

---

## Services Architecture

### Overview

The website operates through multiple interconnected services:

```
┌─────────────────────────────────────────────────────────────────┐
│                         Internet Traffic                         │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                    ┌───────────▼──────────┐
                    │   Caddy (HTTPS)      │
                    │   Reverse Proxy      │
                    │   Ports: 80, 443     │
                    └───────────┬──────────┘
                                │
                ┌───────────────┼───────────────┐
                │               │               │
       ┌────────▼────────┐  ┌──▼──────┐  ┌────▼─────┐
       │ Backend API     │  │ Static  │  │ Gimbal   │
       │ Node.js/Express │  │ Files   │  │ (OIDC)   │
       │ Port: 8393      │  │ (HTML)  │  │ VPN Only │
       └────────┬────────┘  └─────────┘  └──────────┘
                │
       ┌────────▼────────┐
       │  PostgreSQL DB  │
       │  Port: 5432     │
       └─────────────────┘
```

### Service Layers

1. **Reverse Proxy Layer:** Caddy
2. **Application Layer:** Backend API (Node.js/Express)
3. **Static Assets:** HTML/CSS/JS files served by Caddy
4. **Data Layer:** PostgreSQL Database
5. **Container Layer:** Docker containers for isolated services
6. **VPN Layer:** WireGuard (wg-easy)
7. **Privacy Layer:** Tor hidden service (pyazopay)
8. **Auth Layer:** Keycloak (the_bums_win)

---

## Essential Environment Variables

### ❌ CRITICAL (Server will NOT start without these)

These variables are enforced by failsafe checks in `backend/server.ts`:

| Variable | Purpose | Example |
|----------|---------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `JWT_SECRET` | Authentication token signing key | 64+ character random string |
| `PORT` | Backend API port | `8393` |
| `EMAIL_PROVIDER` | At least one email config | See SMTP or SendGrid below |

### ⚠️ CRITICAL - Email Configuration (ONE required)

**Option 1: SMTP (Currently Active)**
```bash
SMTP_HOST=smtp.mail.me.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=nyagrodha@icloud.com
SMTP_PASS=ofch-wrgg-yjtb-ukrv
FROM_EMAIL=formitselfisemptiness@aformulationoftruth.com
FROM_NAME=Karuppacāmi Nirmeyappōr
```

**Option 2: SendGrid**
```bash
SENDGRID_API_KEY=SG.xxx...xxx
SENDGRID_FROM_EMAIL=noreply@aformulationoftruth.com
SENDGRID_FROM_NAME=A Formulation of Truth
```

### 🟡 IMPORTANT (Degraded functionality without these)

| Variable | Purpose | Default |
|----------|---------|---------|
| `BASE_URL` | Site base URL | `https://aformulationoftruth.com` |
| `SESSION_SECRET` | Session encryption key | Random string |
| `TOKEN_EXPIRY_MINUTES` | Auth token lifetime | `15` |

### 🔵 OPTIONAL (Features disabled without these)

| Variable | Purpose | Feature |
|----------|---------|---------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot API token | Karuppacāmi bot |
| `TWILIO_ACCOUNT_SID` | Twilio account ID | SMS/phone auth |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | SMS/phone auth |
| `IPINFO_TOKEN` | IP geolocation service | User location lookup |
| `REDIS_URL` | Redis connection | Session store, queue |
| `ENCRYPTION_KEY` | Additional encryption | Secure data |

### 📊 Database Configuration

```bash
# Option 1: Connection String (Recommended)
DATABASE_URL=postgresql://a4m_app:jsT%40sA2nd1nsd3cl2y0@localhost:5432/a4m_db

# Option 2: Individual Variables (Fallback)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=a4m_db
DB_USER=a4m_app
DB_PASSWORD=jsT@sA2nd1nsd3cl2y0
```

### 🔒 Security Configuration

```bash
# Rate Limiting
RATE_LIMIT_WINDOW=900000        # 15 minutes in ms
RATE_LIMIT_MAX=100              # Max requests per window
AUTH_RATE_LIMIT_MAX=10          # Max auth attempts

# Session Security
SESSION_NAME=proust_session
SESSION_MAX_AGE=604800000       # 7 days in ms
SESSION_SECURE=false            # Set true in production with HTTPS
SESSION_HTTP_ONLY=true
SESSION_SAME_SITE=lax
```

---

## Service Breakdown

### 1. Backend API Service (a4mula.service)

**Systemd Service:** `a4mula.service`
**Port:** 8393
**Process:** Node.js (Express.js)
**Entry Point:** `/home/marcel/aformulationoftruth/backend/dist/server.js`
**Working Directory:** `/home/marcel/aformulationoftruth/backend`
**Environment File:** `/home/marcel/aformulationoftruth/backend/.env`

**Responsibilities:**
- RESTful API endpoints (`/api/*`)
- Authentication (magic links, JWT)
- Questionnaire logic
- Database operations
- Email sending (magic links, notifications)
- Telegram bot integration

**Control Commands:**
```bash
sudo systemctl status a4mula      # Check status
sudo systemctl restart a4mula     # Restart service
sudo systemctl stop a4mula        # Stop service
sudo systemctl start a4mula       # Start service
sudo journalctl -u a4mula -f      # View logs (live)
sudo journalctl -u a4mula -n 50   # View last 50 log lines
```

**Service Configuration:**
```ini
[Unit]
Description=a formulation of truth - backend API
After=network.target

[Service]
Type=simple
User=marcel
Group=www-data
WorkingDirectory=/home/marcel/aformulationoftruth/backend
EnvironmentFile=/home/marcel/aformulationoftruth/backend/.env
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=5
NoNewPrivileges=true
ProtectHome=false
```

### 2. Caddy Web Server

**Systemd Service:** `caddy.service`
**Ports:** 80 (HTTP), 443 (HTTPS)
**Config:** `/etc/caddy/Caddyfile`
**Purpose:** Reverse proxy, HTTPS termination, static file serving

**Responsibilities:**
- HTTPS/TLS certificate management (Let's Encrypt)
- Reverse proxy to backend API (port 8393)
- Serve static frontend files
- Route `/auth/*` to Gimbal (Keycloak via VPN)
- Security headers
- Gzip/Zstd compression
- Access logging

**Key Routes:**
```
/                    → Static files (/var/www/aformulationoftruth/frontend/public)
/api/*               → Backend API (http://localhost:8393)
/auth/request        → Backend API (magic links)
/auth/verify         → Backend API (magic links)
/auth/callback       → Backend API (auth callback)
/auth/*              → Gimbal OIDC (https://10.99.0.1 via VPN)
/uploads/*           → Static uploads directory
```

**Control Commands:**
```bash
sudo systemctl status caddy
sudo systemctl reload caddy     # Reload config without downtime
sudo systemctl restart caddy
caddy validate --config /etc/caddy/Caddyfile  # Validate config
```

### 3. Docker Containers

**Service:** `aformulationoftruth-services.service`
**Compose File:** `/home/marcel/aformulationoftruth/docker/docker-compose.yml`

#### Container: karuppacami-frontend
- **Status:** Running
- **Port:** 5742 (internal)
- **Purpose:** React frontend (currently unused in production - Caddy serves static files instead)

#### Container: karuppacami-backend
- **Status:** Running
- **Port:** 3001 (internal)
- **Purpose:** Backup/alternative backend (currently unused - systemd service is active)

#### Container: pyazopay (Tor)
- **Status:** Running (UNHEALTHY)
- **Image:** `osminogin/tor-simple:latest`
- **Purpose:** Tor hidden service for anonymous access
- **Note:** Currently unhealthy - requires investigation

#### Container: wg-easy (WireGuard VPN)
- **Status:** Running (HEALTHY)
- **Port:** 51820/udp
- **Purpose:** WireGuard VPN server for secure remote access
- **Admin UI:** https://vpn.aformulationoftruth.com

#### Container: the_bums_win (Keycloak)
- **Status:** Running
- **Port:** 7134 → 8080
- **Purpose:** OIDC/OAuth2 authentication provider
- **Access:** Via VPN only (gimbal.fobdongle.com)

**Control Commands:**
```bash
docker ps -a                                    # List all containers
docker logs karuppacami-backend -f              # View logs (live)
docker inspect pyazopay                         # Inspect container
docker restart pyazopay                         # Restart container
cd /home/marcel/aformulationoftruth/docker && docker-compose restart
```

### 4. PostgreSQL Database

**Connection:** `localhost:5432` (primary) or `185.146.234.144:5432` (remote)
**Database:** `a4m_db`
**User:** `a4m_app`
**Connection String:** See `DATABASE_URL` in `.env`

**Tables:**
- `users` - User accounts
- `user_answers` - Questionnaire responses
- `questionnaire_sessions` - Session tracking
- `questionnaire_question_order` - Randomized question order
- `magic_link_tokens` - Authentication tokens
- `responses` - Legacy response storage

**Connection Test:**
```bash
psql "$DATABASE_URL" -c "SELECT version();"
```

### 5. Telegram Bot (Optional)

**Service:** `telegram-bot.service`
**Status:** Auto-restarting (requires configuration)
**Token:** Set via `TELEGRAM_BOT_TOKEN` in backend `.env`

**Purpose:**
- Karuppacāmi bot for user interaction
- Questionnaire delivery via Telegram

---

## Network Architecture

### External Network

```
aformulationoftruth.com           → 37.228.129.173 (IPv4)
                                  → 2a06:1700:1:45::435c:c15f (IPv6)
www.aformulationoftruth.com       → Same as above
app.aformulationoftruth.com       → Same as above
vpn.aformulationoftruth.com       → WireGuard VPN (port 51820/udp)
```

### Internal Ports

| Service | Port | Protocol | Binding |
|---------|------|----------|---------|
| Backend API | 8393 | HTTP | 0.0.0.0 |
| Caddy | 80, 443 | HTTP/HTTPS | Public IPs |
| PostgreSQL | 5432 | PostgreSQL | localhost |
| WireGuard | 51820 | UDP | 0.0.0.0 |
| Keycloak | 7134 | HTTP | localhost |

### Docker Networks

- `web` - External network for public-facing containers
- `internal` - Internal network for inter-container communication
- `vpn-network` - VPN subnet (10.8.0.0/24)

---

## Failsafe Mechanisms

### Backend Server Failsafe (NEW)

**Location:** `/home/marcel/aformulationoftruth/backend/server.ts` (lines 6-73)

**Behavior:**
1. On startup, validates presence of required environment variables
2. Exits with code 1 if critical variables are missing
3. Prints detailed error message showing which variables are missing
4. Prevents server from starting in an invalid state

**Example Error Output:**
```
═══════════════════════════════════════════════════════════
❌ FATAL ERROR: Missing required environment variables
═══════════════════════════════════════════════════════════
The following REQUIRED variables are not set:
   ✗ DATABASE_URL
   ✗ JWT_SECRET

Server cannot start without these variables.
Please check your .env file at:
   /home/marcel/aformulationoftruth/backend/.env
═══════════════════════════════════════════════════════════
```

**Required Variables Checked:**
- `DATABASE_URL` - Database connection
- `JWT_SECRET` - Authentication security
- `PORT` - Server port
- Email provider configuration (SMTP or SendGrid)

**To Test:**
```bash
# Temporarily rename .env to test failsafe
cd /home/marcel/aformulationoftruth/backend
mv .env .env.backup
npm run build && node dist/server.js
# Should exit with error
mv .env.backup .env
```

---

## Health Monitoring System

### Overview

A comprehensive health monitoring script runs every 5 minutes via cron, checking all critical services and infrastructure components.

**Script:** `/home/marcel/aformulationoftruth/health-monitor.sh`
**Schedule:** Every 5 minutes
**Logs:** `/home/marcel/aformulationoftruth/logs/health-monitor.log`
**Alerts:** Email sent to `halahalamohashantaye@icloud.com`
**Alert Trigger:** Only when warning level RISES (not on every check)

### What It Monitors

#### 1. Services
- ✓ Backend API service (a4mula)
- ✓ Docker service
- ✓ Caddy web server
- ✓ Individual Docker containers

#### 2. Network
- ✓ Backend listening on port 8393
- ✓ Caddy listening on ports 80, 443
- ✓ Database connectivity

#### 3. HTTP Endpoints
- ✓ Main site (https://aformulationoftruth.com)
- ✓ API endpoint (/api/ping)
- ✓ Response codes and timing

#### 4. SSL/TLS
- ✓ Certificate validity
- ✓ Days until expiration
- ⚠️ Alert if < 30 days
- ❌ Critical if < 7 days

#### 5. System Resources
- ✓ Disk usage
- ✓ Memory usage
- ⚠️ Warning if > 80%
- ❌ Critical if > 90%

#### 6. Configuration
- ✓ Essential .env variables present
- ✓ Variable values not empty

### Warning Levels

| Level | Condition | Email Sent? |
|-------|-----------|-------------|
| **OK** | All checks pass | No |
| **WARNING** | Some non-critical issues | Yes, if level rises |
| **CRITICAL** | Critical service down | Yes, if level rises |

### Alert Logic

Emails are sent ONLY when the warning level increases:
- `OK` → `WARNING`: Email sent
- `OK` → `CRITICAL`: Email sent
- `WARNING` → `CRITICAL`: Email sent
- `WARNING` → `WARNING`: No email (same level)
- `WARNING` → `OK`: No email (level decreased)

This prevents alert fatigue while ensuring you're notified of new issues.

### Manual Execution

```bash
# Run health check manually
/home/marcel/aformulationoftruth/health-monitor.sh

# Run and view last 50 lines
/home/marcel/aformulationoftruth/health-monitor.sh 2>&1 | tail -50

# View monitoring log
tail -f /home/marcel/aformulationoftruth/logs/health-monitor.log

# Reset state (forces alert on next run)
rm /tmp/a4mula-health-state.txt
```

### Cron Configuration

```bash
# View current cron jobs
crontab -l

# Edit cron jobs
crontab -e

# Current monitoring schedule
*/5 * * * * /home/marcel/aformulationoftruth/health-monitor.sh >> /home/marcel/aformulationoftruth/logs/health-monitor.log 2>&1
```

---

## Troubleshooting Guide

### Service Won't Start

**Backend API (a4mula) won't start:**

1. Check for missing environment variables:
   ```bash
   sudo journalctl -u a4mula -n 50 | grep "FATAL ERROR"
   ```

2. Verify .env file exists and has correct permissions:
   ```bash
   ls -la /home/marcel/aformulationoftruth/backend/.env
   cat /home/marcel/aformulationoftruth/backend/.env | grep -E '^(DATABASE_URL|JWT_SECRET|PORT)='
   ```

3. Test database connection:
   ```bash
   source /home/marcel/aformulationoftruth/backend/.env
   psql "$DATABASE_URL" -c "SELECT 1;"
   ```

4. Check if port is already in use:
   ```bash
   ss -tlnp | grep :8393
   ```

### Website Not Loading

1. Check Caddy status:
   ```bash
   sudo systemctl status caddy
   curl -I http://localhost
   ```

2. Check if backend is responding:
   ```bash
   curl http://localhost:8393/api/ping
   ```

3. Check Caddy logs:
   ```bash
   sudo journalctl -u caddy -n 50
   ```

4. Validate Caddy configuration:
   ```bash
   caddy validate --config /etc/caddy/Caddyfile
   ```

### Database Connection Issues

1. Test connection from backend directory:
   ```bash
   cd /home/marcel/aformulationoftruth/backend
   source .env
   psql "$DATABASE_URL" -c "SELECT version();"
   ```

2. Check if database is accepting connections:
   ```bash
   nc -zv localhost 5432
   ```

3. Verify credentials in .env file match database

### Email Not Sending

1. Verify SMTP credentials in .env:
   ```bash
   grep -E '^(SMTP_HOST|SMTP_USER|SMTP_PASS)=' /home/marcel/aformulationoftruth/backend/.env
   ```

2. Test SMTP connection:
   ```bash
   python3 -c "import smtplib; s=smtplib.SMTP('smtp.mail.me.com', 587); s.starttls(); print('Connection OK')"
   ```

3. Check backend logs for email errors:
   ```bash
   sudo journalctl -u a4mula -n 100 | grep -i "email\|smtp\|mail"
   ```

### Docker Container Issues

1. View container status:
   ```bash
   docker ps -a
   ```

2. Check specific container logs:
   ```bash
   docker logs pyazopay --tail 50
   docker logs karuppacami-backend --tail 50
   ```

3. Restart unhealthy container:
   ```bash
   docker restart pyazopay
   ```

4. Rebuild and restart all containers:
   ```bash
   cd /home/marcel/aformulationoftruth/docker
   docker-compose down
   docker-compose up -d
   ```

### Health Monitor Not Running

1. Check if cron job is installed:
   ```bash
   crontab -l | grep health-monitor
   ```

2. Verify script is executable:
   ```bash
   ls -la /home/marcel/aformulationoftruth/health-monitor.sh
   ```

3. Run manually to test:
   ```bash
   /home/marcel/aformulationoftruth/health-monitor.sh
   ```

4. Check monitoring logs:
   ```bash
   tail -100 /home/marcel/aformulationoftruth/logs/health-monitor.log
   ```

---

## Quick Reference Commands

### Service Management
```bash
# Backend API
sudo systemctl status a4mula
sudo systemctl restart a4mula
sudo journalctl -u a4mula -f

# Caddy
sudo systemctl status caddy
sudo systemctl reload caddy
sudo journalctl -u caddy -f

# Docker
docker ps -a
docker-compose -f /home/marcel/aformulationoftruth/docker/docker-compose.yml restart
```

### Health Checks
```bash
# Quick health check
curl http://localhost:8393/api/ping
curl -I https://aformulationoftruth.com

# Database check
psql "$DATABASE_URL" -c "SELECT 1;"

# Port checks
ss -tlnp | grep -E ':(80|443|8393|5432)'

# System resources
df -h /
free -h
```

### Logs
```bash
# Backend logs
sudo journalctl -u a4mula -n 50

# Caddy logs
sudo journalctl -u caddy -n 50

# Health monitor logs
tail -f /home/marcel/aformulationoftruth/logs/health-monitor.log

# Docker container logs
docker logs karuppacami-backend -f
```

---

## File Locations

### Configuration Files
```
/etc/caddy/Caddyfile                              # Caddy config
/etc/systemd/system/a4mula.service                # Backend service
/home/marcel/aformulationoftruth/.env             # Root environment vars
/home/marcel/aformulationoftruth/backend/.env     # Backend environment vars
/home/marcel/aformulationoftruth/docker/docker-compose.yml  # Docker config
```

### Application Files
```
/home/marcel/aformulationoftruth/backend/         # Backend source code
/home/marcel/aformulationoftruth/frontend/        # Frontend source code
/var/www/aformulationoftruth/frontend/public/     # Static files (served by Caddy)
/var/www/aformulationoftruth/uploads/             # User uploads
```

### Logs
```
/home/marcel/aformulationoftruth/logs/health-monitor.log  # Health monitor
/var/log/caddy/access.log                         # Caddy access log
/var/log/caddy/error.log                          # Caddy error log
journalctl -u a4mula                              # Backend logs (systemd)
journalctl -u caddy                               # Caddy logs (systemd)
```

### Monitoring
```
/home/marcel/aformulationoftruth/health-monitor.sh  # Health check script
/tmp/a4mula-health-state.txt                      # Current health state
```

---

## Security Notes

1. **Credentials in this document:** This report contains actual credentials and should be kept secure
2. **Environment files:** Never commit `.env` files to git
3. **SSL/TLS:** Automatically managed by Caddy with Let's Encrypt
4. **Firewall:** Ensure only necessary ports (80, 443, 51820) are exposed
5. **Updates:** Keep all services and dependencies updated

---

## Emergency Contacts

- **Admin Email:** halahalamohashantaye@icloud.com
- **Health Alerts:** Sent automatically via email
- **Monitoring:** Runs every 5 minutes via cron

---

## Appendix: Complete Environment Variable List

### Root .env (/home/marcel/aformulationoftruth/.env)
```bash
# Database
DB_USER=aformulation_user
DB_HOST=localhost
DB_NAME=aformulationoftruth
DB_PASSWORD=CHANGE_THIS_PASSWORD_330b4d7ed45e255af2a19944f0f6af31
DB_PORT=5432

# Session
SESSION_SECRET=773b3a9cea29169765973389587ce0b1e6a5181effb5e6e95969970af09d1cca

# SMTP
SMTP_HOST=smtp.mail.me.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=nyagrodha@icloud.com
SMTP_PASS=ofch-wrgg-yjtb-ukrv

# Email
FROM_NAME=Karuppacāmi Nirmeyapōr
FROM_EMAIL=formitselfisemptiness@aformulationoftruth.com
EMAIL_SUBJECT=an apotropaic sign-in Link
TOKEN_EXPIRY_MINUTES=8

# Application
BASE_URL=https://aformulationoftruth.com
VPN_URL=https://vpn.aformulationoftruth.com
NODE_ENV=production
PORT=5000

# Tor
TOR_ENABLED=true
TOR_PORT=2015
TOR_CONTROL_PORT=9051

# Security
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=100
AUTH_RATE_LIMIT_MAX=10

# Docker
DOCKER_NETWORK=web
```

### Backend .env (/home/marcel/aformulationoftruth/backend/.env)
```bash
# Server
PORT=8393
API_PREFIX=/api/v1

# Database
DATABASE_URL=postgresql://a4m_app:jsT%40sA2nd1nsd3cl2y0@localhost:5432/a4m_db

# JWT
JWT_SECRET=+Rw+suiD3UdO7++JahQMGpnYf5DkQPeum/uwidNbma2Nh4q0xOvNubZo4BbjHvmj1JER2gmrY5ogLzyZcjCUYQ==

# Email (SendGrid)
SENDGRID_API_KEY=SG.XXXXXXXXXXXXXXXXXXXXXXX.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
SENDGRID_FROM_EMAIL=noreply@aformulationoftruth.com
SENDGRID_FROM_NAME=A Formulation of Truth

# Telegram
TELEGRAM_BOT_TOKEN=7318854818:AAE71YagfX9gP7C5jlFnw1RgGCAN1VuZ0_g

# Base URL
BASE_URL=https://aformulationoftruth.com

# Token expiry
TOKEN_EXPIRY_MINUTES=15
```

---

**End of Report**

This infrastructure report provides complete documentation of all services, configurations, and monitoring systems for aformulationoftruth.com. For questions or issues, refer to the troubleshooting guide or check the health monitoring logs.
