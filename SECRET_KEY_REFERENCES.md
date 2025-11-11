# Secret Key References - A Formulation of Truth

This document lists all locations where secret keys and sensitive credentials are referenced in the codebase. These should be properly secured and never committed to version control.

## JWT_SECRET References

The JWT_SECRET is used for signing and verifying JSON Web Tokens for authentication.

### Configuration Files
1. **`.env.local`** (line 35)
   - Location: `/home/marcel/aformulationoftruth/.env.local`
   - Current value: `~/etc/a4mula/jwt_public.pem`
   - Note: This appears to reference a public key file path

2. **`backend/.env.example`** (line 5)
   - Location: `/home/marcel/aformulationoftruth/backend/.env.example`
   - Template value: `your-super-secure-jwt-secret-key-here`
   - Purpose: Example configuration template

3. **`frontend/.env.example`** (line 6)
   - Location: `/home/marcel/aformulationoftruth/frontend/.env.example`
   - Template value: (commented out)
   - Purpose: Example configuration template

### Application Code

#### Backend
1. **`backend/server.js`** (lines 57, 187)
   - Hardcoded fallback: `'your-secret-key'`
   - ⚠️ **ACTION REQUIRED**: Replace hardcoded value with environment variable

2. **`backend/middleware/auth.js`** (lines 3, 26, 70)
   - Uses: `process.env.JWT_SECRET || 'your-secret-key'`
   - Fallback: `'your-secret-key'`

3. **`backend/routes/auth.js`** (line 46)
   - Uses: `process.env.JWT_SECRET || 'your-secret-key'`
   - Fallback: `'your-secret-key'`

4. **`backend/auth/magic-link.js`** (lines 4, 18)
   - Uses: `process.env.JWT_SECRET`
   - No fallback (will throw if missing)

#### Frontend
1. **`frontend/api/_lib/jwt.js`** (lines 4, 5, 10, 11)
   - Uses: `process.env.JWT_SECRET`
   - Throws error if missing
   - Proper validation in place ✓

### Test Files
Test files use hardcoded test secrets (acceptable for testing):
- `backend/tests/auth.test.js` - Uses `'test-secret-key'`
- `backend/tests/jwt-functions.test.js` - Uses `'test-secret-key'`

## Required Actions

### 1. Update Hardcoded Secrets
Replace all hardcoded JWT_SECRET values with proper environment variable usage:

```javascript
// ❌ CURRENT (server.js line 57)
const JWT_SECRET = 'your-secret-key';

// ✅ SHOULD BE
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
```

### 2. Secret Key File Location
The `.env.local` references a keyfile at `~/etc/a4mula/jwt_public.pem`

**Verify this file exists at:**
- `/home/marcel/etc/a4mula/jwt_public.pem`
- Or configure the correct path in `.env.local`

### 3. Environment Variable Setup
Ensure JWT_SECRET is set in:
1. Production environment variables
2. `.env.local` (for local development)
3. CI/CD pipeline secrets

### 4. Key Generation (if needed)
If generating a new JWT secret key:

```bash
# Generate a strong random secret (32 bytes, base64 encoded)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Or for RSA key pair (if using public/private key JWT)
ssh-keygen -t rsa -b 4096 -m PEM -f jwt_key
# Creates jwt_key (private) and jwt_key.pub (public)
```

## Security Best Practices

1. **Never commit** `.env.local` or `.env` files to git
2. **Rotate keys** periodically (every 90 days recommended)
3. **Use different keys** for development, staging, and production
4. **Store production keys** in a secure vault (e.g., AWS Secrets Manager, HashiCorp Vault)
5. **Limit access** to secret keys to only necessary personnel
6. **Monitor** for key exposure in logs or error messages

## Other Sensitive Configuration

### Email Configuration (SMTP)
From `backend/utils/mailer.js`:
- `SMTP_HOST` - Email server hostname
- `SMTP_PORT` - Email server port
- `SMTP_USER` - Email username
- `SMTP_PASS` - Email password (⚠️ SENSITIVE)
- `SMTP_SECURE` - SSL/TLS setting

### Database
From `.env.local`:
- `DATABASE_URL` - PostgreSQL connection string (contains password)

### Keybase Bot
From configuration:
- Keybase bot credentials (if any)

## Recommended .gitignore Entries

Ensure these patterns are in `.gitignore`:
```
.env
.env.local
.env.*.local
*.pem
*.key
secrets/
```

## Audit History

- **2025-10-05**: Initial audit completed
- **Action Items**:
  1. Remove hardcoded JWT_SECRET from `backend/server.js`
  2. Verify keyfile exists at `~/etc/a4mula/jwt_public.pem`
  3. Document key rotation procedure
  4. Set up automated secret scanning (e.g., git-secrets, truffleHog)
