# Newsletter Email Encryption Setup

This document describes the encrypted newsletter subscription system implemented for aformulationoftruth.com.

## Overview

The system provides:
- **AES-256-GCM encryption** for email addresses stored in the database
- **REST API endpoints** for subscription/unsubscription
- **CLI tools** for decrypting and managing subscriber emails
- **Comprehensive tests** for security validation

## Architecture

### Encryption Method
- **Algorithm**: AES-256-GCM (Galois/Counter Mode)
- **Key Derivation**: PBKDF2 with 100,000 iterations
- **Components**: Random salt (32 bytes) + IV (16 bytes) + Auth Tag (16 bytes) + Encrypted Data
- **Encoding**: Base64 for storage

### Database Schema
```sql
newsletter_subscribers (
  id SERIAL PRIMARY KEY,
  encrypted_email TEXT NOT NULL UNIQUE,
  subscribed_at TIMESTAMP NOT NULL,
  unsubscribed_at TIMESTAMP NULL,
  ip_address VARCHAR(45),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
```

## Setup Instructions

### 1. Generate Encryption Key

```bash
cd /home/marcel/a4ot/backend
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Or use the utility:
```bash
node -e "import('./utils/encryption.js').then(m => console.log(m.generateEncryptionKey()))"
```

### 2. Configure Environment Variables

Add to `/home/marcel/a4ot/backend/.env` or `/home/marcel/.env.local`:

```bash
# Email Encryption Key (REQUIRED - min 32 characters)
EMAIL_ENCRYPTION_KEY=your-generated-64-character-hex-key-here

# Database Connection (if not already set)
DATABASE_URL=postgresql://user:password@localhost:5432/database
```

**SECURITY WARNING**:
- Never commit the `EMAIL_ENCRYPTION_KEY` to version control
- Store it securely (password manager, secrets vault, etc.)
- Losing this key means losing access to all encrypted emails
- Changing this key requires re-encryption of all existing data

### 3. Create Database Table

Run the migration:
```bash
cd /home/marcel/a4ot/backend
node scripts/setup-newsletter-db.js
```

Or manually:
```bash
psql $DATABASE_URL -f migrations/001_create_newsletter_table.sql
```

### 4. Update Server Configuration

The newsletter router is already integrated into `server.js`:
```javascript
import newsletterRouter from './routes/newsletter.js';
app.use('/api/newsletter', newsletterRouter);
```

### 5. Deploy Frontend Changes

The landing page (`/var/www/index.html`) has been updated to POST emails to `/api/newsletter/subscribe`.

## API Endpoints

### Subscribe to Newsletter
```http
POST /api/newsletter/subscribe
Content-Type: application/json

{
  "email": "user@example.com"
}
```

**Response (Success)**:
```json
{
  "success": true,
  "message": "Successfully subscribed to newsletter",
  "alreadySubscribed": false
}
```

**Response (Already Subscribed)**:
```json
{
  "success": true,
  "message": "Email already subscribed",
  "alreadySubscribed": true
}
```

### Unsubscribe from Newsletter
```http
POST /api/newsletter/unsubscribe
Content-Type: application/json

{
  "email": "user@example.com"
}
```

### Get Subscriber Count
```http
GET /api/newsletter/count
```

**Response**:
```json
{
  "success": true,
  "count": 42
}
```

## CLI Tools

### Decrypt and View Subscribers

**View all subscribers**:
```bash
cd /home/marcel/a4ot/backend
node scripts/decrypt-emails.js
```

**View only active subscribers**:
```bash
node scripts/decrypt-emails.js --active
```

**Get subscriber count**:
```bash
node scripts/decrypt-emails.js --count
```

**Export to CSV**:
```bash
node scripts/decrypt-emails.js --export > subscribers.csv
```

**Limit results**:
```bash
node scripts/decrypt-emails.js --active --limit=10
```

**Help**:
```bash
node scripts/decrypt-emails.js --help
```

## Testing

### Run Encryption Tests
```bash
cd /home/marcel/a4ot/backend
npm test tests/encryption.test.js
```

### Run Newsletter API Tests
```bash
npm test tests/newsletter.test.js
```

### Run All Tests
```bash
npm test
```

## Security Considerations

### Encryption Security
- ✅ Uses AES-256-GCM (AEAD - Authenticated Encryption with Associated Data)
- ✅ Random salt and IV for each encryption (prevents rainbow tables)
- ✅ PBKDF2 key derivation with 100,000 iterations
- ✅ Authentication tag prevents tampering
- ✅ Base64 encoding for safe storage

### Database Security
- ✅ Encrypted emails stored as unique constraint (prevents duplicates)
- ✅ No plaintext emails in database
- ✅ Soft delete (unsubscribed_at) maintains history
- ✅ IP address logging for abuse prevention
- ✅ Indexed for performance

### Application Security
- ✅ Rate limiting via express-rate-limit (100 req/15min)
- ✅ Input validation (email format)
- ✅ Error handling without information leakage
- ✅ CORS enabled for legitimate origins only

## Connectivity Test Results

### Iceland Server (Gimbal.fobdongle.is)
- **Host**: fobdongle (alias)
- **IP Address**: 185.146.234.144
- **Status**: ✅ Ping successful (62ms average)
- **SSH**: ⚠️ Authentication failed (publickey)
- **Notes**: Server is reachable but SSH key needs to be configured

## Backup and Recovery

### Backup Encryption Key
```bash
# Store in secure location
echo $EMAIL_ENCRYPTION_KEY > /secure/path/encryption-key.txt
chmod 600 /secure/path/encryption-key.txt
```

### Export Encrypted Data
```bash
psql $DATABASE_URL -c "COPY newsletter_subscribers TO '/tmp/subscribers_backup.csv' CSV HEADER;"
```

### Recovery Process
1. Restore database from backup
2. Ensure `EMAIL_ENCRYPTION_KEY` environment variable is set correctly
3. Verify decryption works: `node scripts/decrypt-emails.js --count`

## Monitoring

### Check Subscription Rate
```bash
# Subscriptions in last 24 hours
psql $DATABASE_URL -c "SELECT COUNT(*) FROM newsletter_subscribers WHERE subscribed_at > NOW() - INTERVAL '24 hours';"
```

### Check for Errors
```bash
# Check application logs
journalctl -u aformulationoftruth -n 100 | grep -i "newsletter"
```

## Troubleshooting

### "EMAIL_ENCRYPTION_KEY not set"
- Set the environment variable in `.env` or `.env.local`
- Restart the server after setting

### "Database client not available"
- Ensure PostgreSQL connection is established
- Check `DATABASE_URL` in environment variables

### "Email decryption failed"
- Verify `EMAIL_ENCRYPTION_KEY` hasn't changed
- Check database for corrupted data

### Performance Issues
- Add indexes: `CREATE INDEX ON newsletter_subscribers(subscribed_at);`
- Monitor query performance: `EXPLAIN ANALYZE SELECT ...`

## Future Enhancements

- [ ] Email verification tokens
- [ ] Unsubscribe links in emails
- [ ] Subscription preferences (frequency, topics)
- [ ] Export to email marketing platforms
- [ ] Analytics dashboard
- [ ] Automated testing in CI/CD pipeline

## Contact

For questions or issues, contact the system administrator.

---

**Last Updated**: 2025-11-03
**Version**: 1.0.0
**Status**: Production Ready
