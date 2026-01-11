# A Formulation of Truth - Website Deployment & Maintenance Report

**Date:** October 4, 2025
**Server:** aformulationoftruth.com (37.228.129.173)
**Status:** Operational with identified optimization opportunities

## Executive Summary

The website is currently operational and properly configured with Caddy as the reverse proxy server. Both frontend and backend components are running, though several optimization opportunities and test configuration issues have been identified.

## Current Infrastructure Status

### ✅ Web Server Configuration
- **Caddy 2.x** running on ports 80/443 (HTTPS with automatic TLS)
- **Backend service** managed by systemd (`a4mula.service`) and listening on port **5000**; Caddy’s upstream is still configured for 5742, so requests rely on that mapping until the backend port is updated.
- **Frontend** static assets served from `/var/www/aformulationoftruth/public` with the SPA build in `/var/www/aformulationoftruth/apps/frontend/dist`
- **Maintenance page** available at `/var/www/aformulationoftruth/maintenance/`

### ✅ Service Management
- `a4mula.service` (systemd) – active, runs `/home/marcel/aformulationoftruth/backend/server.js` on port 5000 using Node.js
- `a4mula-bun.service` (systemd) – disabled; configuration now sets `PORT=5742` so it aligns with the Caddy reverse proxy once Bun is installed
- `aformulationoftruth-services.service` (systemd) – docker-compose wrapper, currently failing because WireGuard port 51820 is already in use
- `pm2` – installed but no processes running; legacy `ecosystem.config.js` still references `/var/www/aformulationoftruth/a4mulagupta`
- Cron jobs (root and marcel) run security/maintenance scripts only; none reference the archived legacy web roots

### ✅ Domain Configuration
- **Primary domains:** aformulationoftruth.com, www.aformulationoftruth.com, app.aformulationoftruth.com
- **VPN subdomain:** vpn.aformulationoftruth.com
- **IPv4/IPv6 dual-stack** properly configured
- **Security headers** implemented (HSTS, CSP, etc.)

### ✅ SSL/TLS
- Automatic certificate management via ACME
- Security headers properly configured
- HTTP to HTTPS redirects working

## Test Results Summary

### ❌ Frontend Tests (Vitest)
- **Status:** FAILING
- **Issue:** Syntax error in test file (`src/App.test.js`)
- **Root Cause:** Malformed JavaScript in test file
- **Impact:** No test coverage validation possible

### ❌ Backend Tests (Jest)
- **Status:** FAILING
- **Issue:** ES Module import/export syntax errors
- **Root Cause:** Jest configuration doesn't support ES modules properly
- **Tests Affected:** 7 test suites
  - `auth.test.js`
  - `database.test.js`
  - `jwt-functions.test.js`
  - `proust-responses.test.js`
  - `questions-routes.test.js`
  - `rate-limiting.test.js`
  - `server-basic.test.js`

### ✅ Backend Health Check
- **API Health Endpoint:** `/api/health` now provides JSON status with uptime and database latency checks
- **Structured Logging:** Request lifecycle and unexpected errors emit JSON logs (requestId, statusCode, durationMs)
- **External Access:** Returns 403 (expected - backend not directly exposed)

## Optimization Opportunities

### 🔧 High Priority

1. **Fix Test Infrastructure**
   - Configure Jest for ES modules support
   - Fix frontend test syntax errors
   - Implement proper test environment setup

2. **Backend Health Monitoring** – Completed
   - `/api/health` returns runtime + database diagnostics
   - Centralised JSON logger with request-scoped metadata is active
   - Global error handler returns request IDs and captures stack traces

3. **Performance Optimization**
   - **Node.js modules:** Backend (356KB) and Frontend (2.8MB) are reasonable sizes
   - **Frontend build:** Remove unused Tailwind CSS warnings
   - **CSS optimization:** Fix `@import` order issues in CSS

### 🔧 Medium Priority

4. **Security Enhancements**
   - Review rate limiting configuration (currently 100 req/15min)
   - Implement request logging analysis
   - Add security vulnerability scanning

5. **Monitoring & Alerting**
   - Set up service monitoring
   - Configure log rotation for Caddy logs
   - Implement uptime monitoring

### 🔧 Low Priority

6. **Code Quality**
   - Standardize import/export syntax across codebase
   - Implement code linting rules
   - Add TypeScript strict mode for backend

## Deployment Procedures

### Initial Deployment (Fresh Installation)

1. **Prerequisites**
   ```bash
   # Ensure Caddy is installed and running
   sudo systemctl status caddy

   # Verify Node.js version
   node --version  # Should be v18+
   ```

2. **Deploy Frontend**
   ```bash
   cd /var/www/aformulationoftruth/apps/frontend
   npm install
   npm run build
   ```

3. **Deploy Backend**
   ```bash
   cd /var/www/aformulationoftruth/apps/backend
   npm install
   # Start with PM2 or systemd service
   node server.js
   ```

4. **Configure Caddy**
   ```bash
   sudo caddy validate --config /etc/caddy/Caddyfile
   sudo systemctl reload caddy
   ```

### Routine Deployment (Updates)

1. **Backup Current State**
   ```bash
   cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.backup.$(date +%Y%m%d_%H%M%S)
   ```

2. **Deploy Code Changes**
   ```bash
   # Frontend updates
   cd /var/www/aformulationoftruth/apps/frontend
   git pull origin main
   npm install
   npm run build

   # Backend updates
   cd /var/www/aformulationoftruth/apps/backend
   git pull origin main
   npm install
   # Restart backend service
   ```

3. **Test & Verify**
   ```bash
   # Test Caddy config
   sudo caddy validate --config /etc/caddy/Caddyfile

   # Reload if valid
   sudo systemctl reload caddy
   ```

## Maintenance Procedures

### 🚨 Emergency Maintenance Mode

**Switch to Maintenance Mode:**
```bash
main  # Uses the new alias created
```

This alias will:
1. Backup current Caddyfile
2. Switch to maintenance Caddyfile
3. Reload Caddy
4. Display maintenance page to users

**Restore from Maintenance Mode:**
```bash
restore-main  # Uses the new alias created
```

This alias will:
1. Restore original Caddyfile from backup
2. Validate configuration
3. Reload Caddy
4. Verify services are running

### 📋 Routine Maintenance

**Weekly:**
- Check log files: `/var/log/caddy/access.log`
- Monitor disk usage
- Review security logs for suspicious activity

**Monthly:**
- Update dependencies (`npm audit`)
- Review and rotate logs
- Test backup/restore procedures
- Update SSL certificates (automatic via ACME)

**Quarterly:**
- Full security audit
- Performance optimization review
- Disaster recovery test

### 🔧 Service Management

**Caddy:**
```bash
sudo systemctl status caddy
sudo systemctl restart caddy
sudo systemctl reload caddy  # Preferred for config changes
```

**Backend Service:**
```bash
# Check if running
ps aux | grep "node.*server.js"

# Manual start (if not using PM2/systemd)
cd /var/www/aformulationoftruth/apps/backend
node server.js &
```

## File Locations

| Component | Location |
|-----------|----------|
| Caddy Config | `/etc/caddy/Caddyfile` |
| Caddy Logs | `/var/log/caddy/access.log` |
| Frontend Build | `/home/marcel/aformulationoftruth/frontend/build` |
| Frontend Source | `/var/www/aformulationoftruth/apps/frontend` |
| Backend Source | `/var/www/aformulationoftruth/apps/backend` |
| Maintenance Files | `/var/www/aformulationoftruth/maintenance/` |
| SSL Certificates | `/var/lib/caddy/.local/share/caddy/` |

## Troubleshooting Guide

### Site Not Loading
1. Check Caddy status: `sudo systemctl status caddy`
2. Check Caddy config: `sudo caddy validate --config /etc/caddy/Caddyfile`
3. Check DNS resolution: `dig aformulationoftruth.com`
4. Check port availability: `sudo netstat -tlnp | grep ":443"`

### Backend API Not Working
1. Check backend process: `ps aux | grep server.js`
2. Check backend logs: `journalctl -u your-backend-service`
3. Test localhost connection: `curl http://localhost:5742/api/ping`
4. Check database connectivity

### SSL Issues
1. Check certificate status: `sudo caddy list-certificates`
2. Force certificate renewal: `sudo caddy reload --config /etc/caddy/Caddyfile`
3. Check ACME account: `ls /var/lib/caddy/.local/share/caddy/`

## Immediate Action Items

1. **Fix test infrastructure** - Critical for CI/CD
2. **Add backend health endpoint** - Essential for monitoring
3. **Configure proper logging** - Important for debugging
4. **Set up automated backups** - Critical for data protection

## Summary

The website infrastructure is solid with Caddy providing robust reverse proxy and TLS termination. The main concerns are around test infrastructure and monitoring capabilities. The new maintenance mode system provides a professional way to handle planned outages.

**Aliases Added:**
- `main` - Switch to maintenance mode
- `restore-main` - Restore from maintenance mode

The VPN subdomain remains operational during maintenance mode to ensure administrative access is maintained.
