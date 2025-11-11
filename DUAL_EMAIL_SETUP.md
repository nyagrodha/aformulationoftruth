# Dual Email System Configuration

## Overview

The email system has been successfully configured to use two different email providers:

1. **SendGrid** - For regular user emails (magic links, notifications)
2. **Apple SMTP** - For admin/root emails (system notifications)

## Configuration Details

### SendGrid (User Emails)
- **API Key**: Configured in `.env.local`
- **From Address**: `nyagrodha@icloud.com`
- **Status**: ✓ Configured and ready

### Apple SMTP (Admin Emails)
- **Host**: `smtp.mail.me.com`
- **Port**: `587`
- **Security**: STARTTLS
- **From Address**: `nyagrodha@icloud.com`
- **Status**: ✓ Verified and healthy

### Admin Email Addresses
Emails sent to these addresses will use Apple SMTP:
- `root@aformulationoftruth.com`
- `admin@aformulationoftruth.com`
- `marcel@aformulationoftruth.com`

To add more admin emails, update `ADMIN_EMAILS` in `.env.local`:
```bash
ADMIN_EMAILS=root@aformulationoftruth.com,admin@aformulationoftruth.com,another@domain.com
```

## Email Routing Logic

The system automatically routes emails based on the recipient:

```
┌─────────────────────┐
│   Email Request     │
└──────────┬──────────┘
           │
           ▼
    ┌──────────────┐
    │  Is Admin?   │◄─── Checks ADMIN_EMAILS list
    └──────┬───────┘
           │
    ┌──────┴──────┐
    │             │
    ▼             ▼
┌─────────┐  ┌──────────┐
│ SendGrid│  │Apple SMTP│
│  (User) │  │ (Admin)  │
└─────────┘  └──────────┘
```

## Implementation Files

### Modified Files
1. **`backend/utils/mailer.js`** - Complete rewrite with dual provider support
   - Configures both SendGrid and SMTP transporters
   - Implements routing logic with `isAdminEmail()`
   - Provides health check for both providers

2. **`backend/.env.local`** - Added SendGrid configuration
   - `SENDGRID_API_KEY`
   - `SENDGRID_FROM_EMAIL`
   - `SENDGRID_FROM_NAME`
   - `ADMIN_EMAILS`

3. **`backend/package.json`** - Added `@sendgrid/mail` dependency

### New Files
- **`backend/test-dual-email.js`** - Test script to verify routing logic

## Testing

### Automated Test
Run the test script to verify routing:
```bash
cd /home/marcel/aformulationoftruth/backend
node test-dual-email.js
```

### Manual Testing
```bash
# Test user email (will use SendGrid)
curl -X POST http://localhost:5742/auth/request \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com"}'

# Test admin email (will use Apple SMTP)
curl -X POST http://localhost:5742/auth/request \
  -H "Content-Type: application/json" \
  -d '{"email":"root@aformulationoftruth.com"}'
```

### Check Logs
```bash
tail -f /home/marcel/aformulationoftruth/backend/server-dual-email.log
```

Look for these indicators:
- `📬 Email Routing Decision:` - Shows routing logic
- `Provider: SendGrid` - User email
- `Provider: Apple SMTP` - Admin email

## Completing SendGrid Setup

⚠️ **Action Required**: Verify sender identity in SendGrid

SendGrid requires sender email addresses to be verified before sending emails. You have two options:

### Option 1: Verify Current Sender (Recommended)
1. Log into SendGrid Dashboard
2. Go to **Settings** → **Sender Authentication**
3. Click **Verify a Single Sender**
4. Add `nyagrodha@icloud.com`
5. Check email for verification link
6. Complete verification

Documentation: https://sendgrid.com/docs/for-developers/sending-email/sender-identity/

### Option 2: Use Different Sender Email
If you have a verified SendGrid sender, update `.env.local`:
```bash
SENDGRID_FROM_EMAIL=your-verified-email@domain.com
```

Then restart the backend:
```bash
pkill -f "node server.js"
cd /home/marcel/aformulationoftruth/backend
nohup node server.js > server.log 2>&1 &
```

## Health Check API

The mailer exports a `healthCheck()` function that returns the status of both providers:

```javascript
import { healthCheck } from './utils/mailer.js';

const health = await healthCheck();
// Returns:
// {
//   status: 'healthy',
//   sendgrid: { configured: true, status: 'ready' },
//   smtp: { configured: true, status: 'healthy', config: {...} },
//   adminEmails: [...]
// }
```

## Troubleshooting

### SendGrid Errors
- **"Sender Identity not verified"**: Complete sender verification (see above)
- **"API key invalid"**: Check `SENDGRID_API_KEY` in `.env.local`
- **Rate limiting**: SendGrid free tier limits apply

### Apple SMTP Errors
- **"Authentication failed"**: Check `SMTP_PASS` (app-specific password)
- **"Connection timeout"**: Verify network connectivity to `smtp.mail.me.com:587`
- **"TLS error"**: Ensure `SMTP_SECURE=false` (STARTTLS on port 587)

### Routing Issues
- Check `ADMIN_EMAILS` list in `.env.local`
- Email addresses are case-insensitive
- Comma-separated list, no spaces after commas

## Monitoring

### Startup Messages
On server start, you should see:
```
✓ SendGrid configured for user emails
✓ Apple SMTP configured for admin emails: smtp.mail.me.com:587
✓ SMTP transporter ready and verified
```

### Runtime Logging
Each email send includes:
```
📬 Email Routing Decision:
   Recipient: user@example.com
   Is Admin: No
   Provider: SendGrid

📧 Sending email via SendGrid to: user@example.com
✓ Email sent via SendGrid. MessageID: <message-id>
```

## Security Considerations

1. **API Keys**: SendGrid API key is stored in `.env.local` (not in git)
2. **SMTP Credentials**: Apple app-specific password in `.env.local`
3. **Admin List**: Only specified addresses use Apple SMTP
4. **Token Security**: Magic link tokens are cryptographically secure
5. **Rate Limiting**: Both providers have rate limits (configure in application)

## Rollback Procedure

If issues arise, revert to single-provider setup:

1. **Option A: Use only SendGrid**
   ```bash
   # In .env.local, comment out SMTP settings
   # SMTP_HOST=...
   # SMTP_USER=...
   # SMTP_PASS=...
   ```

2. **Option B: Use only Apple SMTP**
   ```bash
   # In .env.local, comment out SendGrid settings
   # SENDGRID_API_KEY=...
   ```

3. Restore previous `mailer.js` from git:
   ```bash
   git checkout HEAD -- backend/utils/mailer.js
   ```

## Next Steps

1. ✅ **Verify SendGrid sender identity**
2. Test production email delivery
3. Monitor email delivery rates and errors
4. Consider adding email templates for different message types
5. Implement email analytics/tracking if needed

## Support

- SendGrid Docs: https://docs.sendgrid.com/
- Apple Mail Setup: https://support.apple.com/en-us/HT204397
- Project Issues: Check server logs in `/home/marcel/aformulationoftruth/backend/`

---

**Status**: ✓ Implementation Complete | ⚠️ Pending SendGrid sender verification
**Last Updated**: 2025-10-14
