# Gimbal Backend Setup Instructions

**Server:** gimbal.fobdongle.com (185.146.234.144)
**User:** wthami
**Purpose:** Handle authentication endpoints and send magic link emails via SendGrid

---

## Prerequisites

Before starting, ensure you have:
- SSH access to gimbal.fobdongle.com
- SendGrid API key with verified sender domain
- Backend codebase (from aformulationoftruth repo)

---

## Step 1: Connect to Gimbal

```bash
ssh wthami@185.146.234.144
# Or if SSH config is set up:
ssh fobdongle
```

---

## Step 2: Check Current Backend Status

### 2.1 Check for running Node processes
```bash
ps aux | grep -E "node|npm|tsx" | grep -v grep
```

### 2.2 Check which ports are in use
```bash
sudo lsof -i :3000
sudo lsof -i :5742
sudo lsof -i :8080
```

### 2.3 Check if backend directory exists
```bash
ls -la ~/aformulationoftruth/backend
# Or check /var/www or /opt for backend installation
find ~ /var/www /opt -name "server.ts" -o -name "server.js" 2>/dev/null | head -10
```

---

## Step 3: Deploy Backend Code (if not present)

### 3.1 Clone repository
```bash
cd ~
git clone https://github.com/nyagrodha/aformulationoftruth.git
cd aformulationoftruth/backend
```

### 3.2 Install dependencies
```bash
npm install
```

---

## Step 4: Configure Environment Variables

### 4.1 Create .env file
```bash
cd ~/aformulationoftruth/backend
cp .env.example .env
nano .env
```

### 4.2 Set required environment variables

**Critical variables to configure:**

```env
# Database (PostgreSQL on main server via VPN)
DATABASE_URL=postgresql://username:password@10.99.0.2:5432/aformulationoftruth

# JWT Secret (use the same as main server for compatibility)
JWT_SECRET=5ecc095fac74264f3ae4b30edd993a55f24c8729e2d0c16a5af8d58106d3d4b9

# SendGrid Configuration
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=formitselfisemptiness@aformulationoftruth.com
SENDGRID_FROM_NAME=A Formulation of Truth

# Email Service Selection
EMAIL_SERVICE=sendgrid

# Base URL for magic links
BASE_URL=https://aformulationoftruth.com

# Server Configuration
PORT=3000
NODE_ENV=production

# Admin Configuration
ADMIN_EMAIL=your-admin@email.com

# IP Geolocation (optional but recommended)
IPINFO_TOKEN=your_ipinfo_token_here

# Twilio Configuration (if using phone verification)
TWILIO_ACCOUNT_SID=ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
TWILIO_AUTH_TOKEN=your_actual_twilio_auth_token
TWILIO_VERIFY_SERVICE_SID=VAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

**IMPORTANT:** Get the actual SendGrid API key from:
- SendGrid Dashboard → Settings → API Keys → Create API Key
- Permissions: Full Access (or at minimum: Mail Send)

---

## Step 5: Verify SendGrid Domain Authentication

### 5.1 Check if domain is verified
```bash
# Log into SendGrid dashboard at https://app.sendgrid.com
# Navigate to: Settings → Sender Authentication → Domain Authentication
# Verify that "aformulationoftruth.com" is listed and verified
```

### 5.2 If domain is NOT verified:
1. Add domain authentication in SendGrid
2. Add DNS records to aformulationoftruth.com domain:
   - CNAME records for DKIM
   - SPF record (TXT)
   - DMARC record (optional but recommended)

Example DNS records you'll need to add:
```
s1._domainkey.aformulationoftruth.com CNAME s1.domainkey.u12345678.wl123.sendgrid.net
s2._domainkey.aformulationoftruth.com CNAME s2.domainkey.u12345678.wl123.sendgrid.net
```

---

## Step 6: Test SendGrid Configuration

### 6.1 Create test script
```bash
cd ~/aformulationoftruth/backend
nano test-sendgrid.js
```

**test-sendgrid.js:**
```javascript
import sgMail from '@sendgrid/mail';
import dotenv from 'dotenv';

dotenv.config();

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const msg = {
  to: 'your-test-email@example.com', // Change to your email
  from: process.env.SENDGRID_FROM_EMAIL,
  subject: 'SendGrid Test from Gimbal',
  text: 'If you receive this, SendGrid is configured correctly!',
  html: '<strong>If you receive this, SendGrid is configured correctly!</strong>',
};

sgMail
  .send(msg)
  .then(() => {
    console.log('✅ Email sent successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ SendGrid error:', error.response?.body || error);
    process.exit(1);
  });
```

### 6.2 Run test
```bash
node test-sendgrid.js
```

**Expected output:**
```
✅ Email sent successfully!
```

If you see errors, check:
- API key is correct
- From email matches verified sender
- Domain is verified in SendGrid

---

## Step 7: Build and Start Backend

### 7.1 Build TypeScript (if using TypeScript)
```bash
cd ~/aformulationoftruth/backend
npm run build
```

### 7.2 Start backend server
```bash
# Option 1: Using PM2 (recommended for production)
npm install -g pm2
pm2 start dist/server.js --name "gimbal-backend"
pm2 save
pm2 startup  # Follow instructions to enable auto-start

# Option 2: Using node directly (for testing)
node dist/server.js

# Option 3: Using npm script
npm start
```

### 7.3 Verify server is running
```bash
curl http://localhost:3000/api/ping
# Expected: {"pong":true}
```

---

## Step 8: Test Auth Endpoint Locally

### 8.1 Test magic link request
```bash
curl -X POST http://localhost:3000/auth/request \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

**Expected response (success):**
```json
{
  "message": "Magic link sent to your email",
  "email": "test@example.com"
}
```

**Expected response (failure - check logs):**
```json
{
  "error": "Failed to send magic link. Please try again."
}
```

### 8.2 Check server logs
```bash
# If using PM2:
pm2 logs gimbal-backend

# If running manually, check console output
```

---

## Step 9: Configure Firewall/Network

### 9.1 Check if port 3000 is accessible from VPN
```bash
# On gimbal:
sudo ufw status
sudo ufw allow 3000/tcp  # If needed

# Or iptables:
sudo iptables -L -n | grep 3000
```

### 9.2 Test connectivity from main server
```bash
# From aformulationoftruth.com server:
curl -X POST http://10.99.0.1:3000/auth/request \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

---

## Step 10: Configure Web Server (Caddy/Nginx)

### 10.1 Check if Caddy is running
```bash
sudo systemctl status caddy
```

### 10.2 Create/update Caddyfile
```bash
sudo nano /etc/caddy/Caddyfile
```

**Caddyfile configuration:**
```caddy
gimbal.fobdongle.com {
    # Auth endpoints
    handle /auth/* {
        reverse_proxy http://localhost:3000
    }

    # API endpoints
    handle /api/* {
        reverse_proxy http://localhost:3000
    }

    # Health check
    handle /health {
        reverse_proxy http://localhost:3000
    }
}
```

### 10.3 Reload Caddy
```bash
sudo systemctl reload caddy
sudo systemctl status caddy
```

---

## Step 11: Test End-to-End Flow

### 11.1 Test from external (main server)
```bash
# From aformulationoftruth.com:
curl -X POST https://gimbal.fobdongle.com/auth/request \
  -H "Content-Type: application/json" \
  -d '{"email":"your-real-email@example.com"}'
```

### 11.2 Check email inbox
- You should receive an email with subject like "Magic Link Login"
- Email should be from: formitselfisemptiness@aformulationoftruth.com
- Email should contain a link to: https://aformulationoftruth.com/auth/verify?token=...

### 11.3 Test magic link verification
Click the link or:
```bash
curl "https://aformulationoftruth.com/auth/verify?token=YOUR_TOKEN_HERE"
```

---

## Step 12: Monitor and Debug

### 12.1 Check PM2 status
```bash
pm2 status
pm2 logs gimbal-backend --lines 100
```

### 12.2 Check system resources
```bash
htop
df -h
free -h
```

### 12.3 Check database connectivity
```bash
# Test PostgreSQL connection from gimbal
psql "postgresql://username:password@10.99.0.2:5432/aformulationoftruth" -c "SELECT NOW();"
```

---

## Troubleshooting

### Issue: "Failed to send magic link"

**Check:**
1. SendGrid API key is correct
2. From email is verified in SendGrid
3. Check backend logs: `pm2 logs gimbal-backend`
4. Test SendGrid independently with test script

### Issue: "Network error" from frontend

**Check:**
1. Caddy is proxying /auth/* correctly
2. Backend is running on gimbal
3. VPN connectivity between servers
4. Firewall allows traffic on port 3000

### Issue: "Database connection failed"

**Check:**
1. DATABASE_URL is correct
2. PostgreSQL is accessible from gimbal via VPN (10.99.0.2)
3. Database credentials are correct
4. Test with: `psql $DATABASE_URL -c "SELECT 1;"`

### Issue: Emails not arriving

**Check:**
1. Spam folder
2. SendGrid activity log: https://app.sendgrid.com/email_activity
3. Domain verification status
4. SPF/DKIM DNS records

---

## Security Checklist

- [ ] .env file has restrictive permissions (600)
  ```bash
  chmod 600 ~/aformulationoftruth/backend/.env
  ```
- [ ] Firewall only allows necessary ports
- [ ] Backend runs as non-root user
- [ ] PM2 process monitoring enabled
- [ ] Database connection uses strong password
- [ ] SendGrid API key has minimal required permissions
- [ ] SSL/TLS enabled for all external connections

---

## Maintenance Commands

```bash
# Restart backend
pm2 restart gimbal-backend

# View logs
pm2 logs gimbal-backend

# Update code
cd ~/aformulationoftruth
git pull origin a4ot
cd backend
npm install
npm run build
pm2 restart gimbal-backend

# Check disk space
df -h

# Check memory usage
free -h

# Cleanup old logs
pm2 flush
```

---

## File Locations Reference

| File/Directory | Path |
|----------------|------|
| Backend code | `~/aformulationoftruth/backend/` |
| Environment config | `~/aformulationoftruth/backend/.env` |
| PM2 logs | `~/.pm2/logs/` |
| Caddyfile | `/etc/caddy/Caddyfile` |
| Caddy logs | `/var/log/caddy/` |

---

## Quick Reference Commands

```bash
# SSH to gimbal
ssh wthami@185.146.234.144

# Check backend status
pm2 status

# View logs
pm2 logs gimbal-backend --lines 50

# Test auth endpoint
curl -X POST http://localhost:3000/auth/request \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# Restart backend
pm2 restart gimbal-backend

# Reload Caddy
sudo systemctl reload caddy
```

---

## Success Criteria

✅ Backend running on gimbal.fobdongle.com
✅ SendGrid API key configured and domain verified
✅ Magic link emails sending successfully
✅ VPN connectivity working (10.99.0.1 → gimbal)
✅ Caddy proxying /auth/* requests correctly
✅ Email contains correct verification link to aformulationoftruth.com
✅ Users can complete sign-in flow end-to-end

---

**Document created:** 2025-11-29
**Last updated:** 2025-11-29
**Maintained by:** Claude Code
