# Website Remediation Plan
**Date:** 2025-12-09
**Issues:** Telegram bot domain invalid, Subscription API returning HTML instead of JSON

## Root Cause Analysis

### Issue 1: "Bot domain invalid" Error
- **Location:** Telegram authentication on questionnaire sign-in page
- **Cause:** Telegram bot `qu3stvbot` domain not configured in BotFather
- **Bot Token:** `7318854818:AAE71YagfX9gP7C5jlFnw1RgGCAN1VuZ0_g`

### Issue 2: Subscription API Returns HTML Error
- **Error:** `Unexpected token '<', '<!DOCTYPE'... is not valid JSON`
- **Cause:** Port 8393 is serving a service without proper API routes
- **Expected:** Node backend with full API endpoints should be on port 8393

## Current Infrastructure

- **Web Server:** Caddy (proxying /api/* to localhost:8393)
- **Backend Expected Port:** 8393
- **Backend Location:** `/var/www/aformulationoftruth/apps/backend`
- **Compiled Code:** `/var/www/aformulationoftruth/apps/backend/dist/server.js`
- **Environment File:** `/var/www/aformulationoftruth/apps/backend/.env`

## Step-by-Step Remediation

### Step 1: Stop Incorrect Service on Port 8393

```bash
# Find and kill process on port 8393
sudo fuser -k 8393/tcp
# OR
lsof -ti:8393 | xargs kill -9
```

### Step 2: Start Proper Node Backend

```bash
cd /var/www/aformulationoftruth/apps/backend

# Option A: Start with PM2 (recommended for production)
pm2 start dist/server.js --name backend-api --env production

# Option B: Start with systemd (create service file)
# See Step 2b below

# Option C: Start manually for testing
PORT=8393 node dist/server.js
```

#### Step 2b: Create Systemd Service (Recommended)

Create `/etc/systemd/system/aform-backend.service`:

```ini
[Unit]
Description=A Formulation of Truth Backend API
After=network.target postgresql.service

[Service]
Type=simple
User=marcel
WorkingDirectory=/var/www/aformulationoftruth/apps/backend
Environment="NODE_ENV=production"
EnvironmentFile=/var/www/aformulationoftruth/apps/backend/.env
ExecStart=/usr/bin/node /var/www/aformulationoftruth/apps/backend/dist/server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=aform-backend

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl daemon-reload
sudo systemctl enable aform-backend
sudo systemctl start aform-backend
sudo systemctl status aform-backend
```

### Step 3: Verify API Endpoints

```bash
# Test health/ping endpoint
curl http://localhost:8393/api/ping

# Test subscription endpoint
curl -X POST http://localhost:8393/api/newsletter/subscribe \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# Test from public URL
curl -X POST https://aformulationoftruth.com/api/newsletter/subscribe \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

Expected responses should be JSON, not HTML.

### Step 4: Configure Telegram Bot Domain

1. **Open Telegram and message @BotFather**

2. **Set the bot domain:**
   ```
   /setdomain
   @qu3stvbot
   aformulationoftruth.com
   ```

3. **Verify the domain is set:**
   ```
   /mybots
   @qu3stvbot
   Bot Settings
   Domain
   ```

### Step 5: Test Telegram Widget Integration

The Telegram widget needs to be configured in your HTML. Check that it has:

```html
<script
  async
  src="https://telegram.org/js/telegram-widget.js?22"
  data-telegram-login="qu3stvbot"
  data-size="large"
  data-auth-url="https://aformulationoftruth.com/api/auth/telegram"
  data-request-access="write"
></script>
```

**Important:** The `data-auth-url` must match your registered domain.

### Step 6: Verify Backend Environment Variables

Check `/var/www/aformulationoftruth/apps/backend/.env` contains:

```bash
PORT=8393
TELEGRAM_BOT_TOKEN=7318854818:AAE71YagfX9gP7C5jlFnw1RgGCAN1VuZ0_g
DATABASE_URL=postgresql://user:pass@host:port/database
JWT_SECRET=<your-secret>
# ... other vars
```

## API Endpoints (from backend analysis)

The backend provides these endpoints:
- `GET /api/ping` - Health check
- `POST /api/newsletter/subscribe` - Email subscription (line 50)
- `GET /api/geolocation` - IP geolocation
- `POST /api/auth/keybase/request` - Keybase auth
- `POST /api/auth/keybase/verify` - Keybase verification
- `POST /api/auth/telegram` - Telegram authentication
- `POST /proust` - Proust questionnaire
- `POST /api/internal/send-pdf` - PDF generation
- `GET /api/users/eligible-for-swap` - User swap eligibility
- `GET /api/user/:username/questionnaire` - Get user questionnaire
- `GET /api/user/:username/questionnaire.pdf` - Get PDF
- `POST /api/questionnaire/start` - Start questionnaire
- `POST /api/responses` - Submit responses
- `GET /questions` - Get questions
- `GET /questionnaire` - Questionnaire page
- `GET /about` - About page

## Troubleshooting

### If subscription still returns HTML:

1. Check backend logs:
   ```bash
   # If using systemd
   sudo journalctl -u aform-backend -f

   # If using PM2
   pm2 logs backend-api

   # If manual start
   tail -f /tmp/backend.log
   ```

2. Verify Caddy is proxying correctly:
   ```bash
   sudo systemctl status caddy
   curl -v http://localhost:8393/api/ping
   ```

3. Check database connection in backend logs

### If Telegram bot still shows "domain invalid":

1. Verify domain is set in BotFather
2. Check that the HTML widget URL matches exactly
3. Ensure HTTPS is working (Telegram requires HTTPS)
4. Test bot token:
   ```bash
   curl https://api.telegram.org/bot7318854818:AAE71YagfX9gP7C5jlFnw1RgGCAN1VuZ0_g/getMe
   ```

## Monitoring

After remediation, monitor:
- Backend service status: `systemctl status aform-backend`
- Backend logs: `journalctl -u aform-backend -f`
- API endpoint health: `curl http://localhost:8393/api/ping`
- Caddy proxy status: `systemctl status caddy`

## Rollback Plan

If issues arise:
1. Stop the new backend: `sudo systemctl stop aform-backend`
2. Restart previous service (if any)
3. Check Caddy configuration is unchanged
4. Review logs for specific errors

## Success Criteria

- [ ] Backend service running on port 8393
- [ ] API endpoints return JSON (not HTML errors)
- [ ] Newsletter subscription works from public site
- [ ] Telegram widget no longer shows "Bot domain invalid"
- [ ] Users can authenticate via Telegram
- [ ] All questionnaire features functional

## Additional Notes

- The backend uses PostgreSQL database
- Rate limiting is configured (100 requests per 15 min)
- JWT authentication is used for protected routes
- Telegram bot (Karuppasāmi) is initialized on startup
- Email service configured for magic links and notifications
