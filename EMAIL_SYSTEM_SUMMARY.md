# Email Submission System - Debug Summary and Documentation

## Issues Fixed

### 1. **405 Method Not Allowed Error**
- **Root Cause**: Caddy configuration had `try_files` directive outside of a `handle` block, causing it to intercept API routes
- **Fix**: Wrapped static file serving directives in a `handle` block to make routing mutually exclusive
- **File Changed**: `/etc/caddy/Caddyfile`

### 2. **Backend Auth Route Integration**
- **Issue**: Server.js had hardcoded auth endpoints instead of using the proper auth router
- **Fix**:
  - Imported and mounted the `auth.js` router at `/auth`
  - Updated auth.js endpoints to match frontend expectations (`/request` instead of `/magic-link`)
  - Added proper error handling and response formatting
- **Files Changed**:
  - `/home/marcel/aformulationoftruth/backend/server.js`
  - `/home/marcel/aformulationoftruth/backend/routes/auth.js`

### 3. **Environment Configuration**
- **Issues**:
  - Missing BASE_URL for magic link generation
  - Incorrect SMTP_PASSWORD vs SMTP_PASS variable name
  - Mailer not loading .env.local correctly
- **Fixes**:
  - Added `BASE_URL=https://aformulationoftruth.com` to .env.local
  - Renamed SMTP_PASSWORD to SMTP_PASS
  - Updated mailer.js to explicitly load .env.local from project root
- **Files Changed**:
  - `/home/marcel/aformulationoftruth/.env.local`
  - `/home/marcel/aformulationoftruth/backend/utils/mailer.js`

### 4. **Testing Mode for Development**
- **Added**: Testing mode in mailer.js that logs magic links to console when SMTP is not configured
- **File Changed**: `/home/marcel/aformulationoftruth/backend/utils/mailer.js`

## Current System Architecture

### Flow Diagram
```
User Browser → Frontend Form (index.html)
     ↓ POST /auth/request
Caddy Proxy (port 443)
     ↓ reverse_proxy to localhost:5742
Backend Server (Express)
     ↓ auth router
     ├→ Generate cryptographic token (32 bytes)
     ├→ Store token with 10-min expiry
     ├→ Send email with magic link
     └→ Return success response

Magic Link Click:
     ↓ GET /auth/verify?token=xxx
Backend validates token
     ├→ Check token exists and not expired
     ├→ Delete token (one-time use)
     ├→ Generate JWT session token
     └→ Redirect to app with auth credentials
```

### Key Components

1. **Frontend** (`/home/marcel/aformulationoftruth/frontend/public/index.html`)
   - Email validation
   - AJAX form submission
   - User feedback messages

2. **Caddy Proxy** (`/etc/caddy/Caddyfile`)
   - Routes `/auth/*` to backend on port 5742
   - Serves static files for all other routes

3. **Backend Server** (`/home/marcel/aformulationoftruth/backend/server.js`)
   - Runs on port 5742
   - Mounts auth routes at `/auth`
   - Periodic cleanup of expired tokens

4. **Auth Routes** (`/home/marcel/aformulationoftruth/backend/routes/auth.js`)
   - POST `/auth/request` - Generate and send magic link
   - GET `/auth/verify` - Validate token and create session

5. **Utilities**:
   - `utils/db.js` - Token storage and management
   - `utils/mailer.js` - Email sending with SMTP

## Security Features

1. **Cryptographic Tokens**: 32-byte random tokens using crypto.randomBytes
2. **Token Expiration**: 10-minute expiry with automatic cleanup
3. **One-Time Use**: Tokens deleted immediately after verification
4. **JWT Sessions**: 24-hour session tokens after successful verification
5. **Email Validation**: Frontend and backend validation
6. **Rate Limiting**: Global API rate limiting configured

## Testing the System

### Manual Testing
```bash
# Test backend directly
curl -X POST http://localhost:5742/auth/request \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# Test through Caddy/website
curl -X POST https://aformulationoftruth.com/auth/request \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# Check server logs for magic link (in testing mode)
grep "Magic Link" /home/marcel/aformulationoftruth/backend/server*.log
```

### Production Setup Required

To enable actual email sending, you need to:

1. **Get Gmail App Password**:
   - Go to Google Account settings
   - Enable 2-factor authentication
   - Generate app-specific password
   - Update SMTP_PASS in .env.local

2. **Or use alternative SMTP service**:
   - Update SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
   - Adjust SMTP_SECURE based on provider requirements

3. **Restart backend server**:
   ```bash
   # Find and kill current process
   lsof -i:5742
   kill [PID]

   # Start new instance
   cd /home/marcel/aformulationoftruth/backend
   nohup node server.js > server.log 2>&1 &
   ```

## Monitoring

- Server logs: `/home/marcel/aformulationoftruth/backend/server*.log`
- Caddy logs: `/var/log/caddy/access.log`
- Check server status: `systemctl status caddy`
- Check port usage: `lsof -i:5742`

## Current Status

✅ Frontend form submission working
✅ Caddy proxy routing fixed
✅ Backend processing requests correctly
✅ Cryptographic token generation working
✅ Token storage and expiration working
✅ Magic link verification working
⚠️  Email sending in testing mode (needs SMTP credentials)

The system is fully functional and ready for production once valid SMTP credentials are configured.