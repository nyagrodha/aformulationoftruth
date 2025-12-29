# Application Logging Documentation

## Overview

The application now uses **Winston** for structured JSON logging with automatic log rotation and categorization.

## Log Files

All logs are stored in `/var/log/aformulationoftruth/`:

| File | Purpose | Retention |
|------|---------|-----------|
| `auth.log` | Authentication events (login, logout, magic links) | 5 files × 5MB |
| `error.log` | Error-level messages only | 5 files × 10MB |
| `combined.log` | All application logs | 10 files × 10MB |

Log files automatically rotate when they reach their size limit.

## Log Structure

Logs are stored in JSON format with the following structure:

```json
{
  "timestamp": "2025-12-21 09:09:15",
  "level": "info",
  "message": "Magic link request",
  "service": "aformulationoftruth",
  "category": "auth",
  "event": "attempt",
  "ip": "127.0.0.1",
  "email": "user@example.com",
  "userAgent": "Mozilla/5.0..."
}
```

## Log Levels

- **error**: Critical errors that need immediate attention
- **warn**: Warning messages (failed auth attempts, validation errors)
- **info**: Normal operational messages (successful auth, requests)
- **debug**: Detailed debugging information

## Authentication Events

### Event Types

- **attempt**: User attempted authentication
- **success**: Authentication succeeded
- **failure**: Authentication failed (invalid credentials, expired token)
- **error**: Server error during authentication

### Magic Link Verification Logging

When a user verifies a magic link, the following information is logged:

**On Attempt:**
- Client IP address
- Token presence and length
- Gate session ID (if provided)
- User agent string

**On Success:**
- User ID and email
- Session ID
- Duration of verification
- IP address

**On Failure:**
- Failure reason (invalid format, expired, server error)
- Partial token (first 8 characters only)
- Error details and stack trace (for server errors)
- Duration

## Viewing Logs

### Command-Line Tools

#### `a4m-logs`
View and filter authentication logs:

```bash
# View recent events (default)
a4m-logs recent

# View only errors
a4m-logs errors

# View failed authentication attempts
a4m-logs failures

# View successful authentications
a4m-logs success

# Follow logs in real-time
a4m-logs follow

# View raw JSON
a4m-logs raw

# Show help
a4m-logs help
```

#### `a4m-auth-health`
Get authentication system health report:

```bash
a4m-auth-health
```

Shows:
- Statistics for last hour (attempts, successes, failures, errors)
- Success rate percentage
- Recent errors
- Top IPs by auth attempts

### Manual Log Access

```bash
# View recent auth events
tail -f /var/log/aformulationoftruth/auth.log | jq .

# Search for specific user
cat /var/log/aformulationoftruth/auth.log | jq 'select(.email == "user@example.com")'

# Find all errors in last hour
cat /var/log/aformulationoftruth/auth.log | jq 'select(.level == "error")'

# Count failed attempts by IP
cat /var/log/aformulationoftruth/auth.log | jq -r 'select(.event == "failure") | .ip' | sort | uniq -c | sort -rn
```

## Troubleshooting Magic Link 500 Errors

When investigating 500 errors on the magic-link verify endpoint:

1. **Check error logs:**
   ```bash
   a4m-logs errors
   ```

2. **Look for patterns:**
   ```bash
   cat /var/log/aformulationoftruth/auth.log | jq 'select(.level == "error" and (.message | contains("verify")))'
   ```

3. **Check specific error details:**
   - Error type and message
   - Stack trace
   - Token information (length, format)
   - Session information
   - Client IP and user agent

4. **Common issues logged:**
   - Database connection failures
   - Session storage issues
   - Invalid token formats
   - Expired tokens being retried

## Log Rotation

Logs automatically rotate based on size:
- Old logs are renamed with a numeric suffix (e.g., `auth.log.1`, `auth.log.2`)
- Maximum of 5-10 files retained per log type
- When limit reached, oldest logs are deleted

## Security Considerations

- **Sensitive data**: Tokens are only partially logged (first 8 characters)
- **Emails**: Full email addresses are logged for troubleshooting
- **IPs**: Client IPs are logged for security monitoring
- **Stack traces**: Only logged for server errors (500s), not client errors (400s)

## Performance Impact

- **Async logging**: Winston writes asynchronously (non-blocking)
- **File I/O**: Minimal performance impact
- **Log size**: Automatically managed with rotation
- **Memory**: No significant impact with current configuration

## Adding Logging to New Code

```typescript
import { logAuth, logAPI, logDB } from './logger';

// Authentication logging
logAuth.attempt('User login attempt', { email, ip });
logAuth.success('User logged in', { userId, email });
logAuth.failure('Login failed', { email, reason });
logAuth.error('Login error', error, { email });

// API logging
logAPI.request('POST', '/api/endpoint', { userId });
logAPI.response('POST', '/api/endpoint', 200, duration);
logAPI.error('POST', '/api/endpoint', error);

// Database logging
logDB.query('User query', { query, params });
logDB.error('Query failed', error, { query });
```

## Monitoring

Set up monitoring alerts for:
- High error rates (> 5% of requests)
- Repeated failures from same IP (potential attack)
- Server errors (500s) on critical endpoints
- Unusual patterns in authentication attempts

## Future Enhancements

Potential improvements:
- [ ] ELK stack integration (Elasticsearch, Logstash, Kibana)
- [ ] Real-time alerting (email/Slack on critical errors)
- [ ] Log aggregation for multiple servers
- [ ] Automated log analysis and reports
- [ ] Metrics dashboard (Grafana)

## Contact

For logging issues or questions, check:
- This documentation
- `/var/log/aformulationoftruth/` directory
- Application code in `/server/logger.ts`
