# Database Storage - Magic Link Authentication Flow

## What Gets Saved to PostgreSQL

### ✅ BEFORE (Original Issue)
**Nothing was saved** - Magic link tokens were only in-memory, users weren't created.

### ✅ AFTER (Fixed)

## 1. During Magic Link Verification (`GET /auth/verify`)

When a user clicks the magic link in their email:

### New User Creation
```sql
INSERT INTO users (username, email, password_hash, public_key, last_login)
VALUES (
  'username',           -- Extracted from email (before @)
  'user@example.com',   -- Full email address
  'magic-link-auth',    -- Placeholder (no password for magic link users)
  'email-auth',         -- Placeholder (no public key for email users)
  NOW()                 -- Current timestamp
)
```

**Stored in `users` table:**
| Field | Value | Notes |
|-------|-------|-------|
| `id` | Auto-increment | Primary key |
| `username` | Email prefix | e.g., "john" from "john@example.com" |
| `email` | Full email | e.g., "john@example.com" |
| `password_hash` | 'magic-link-auth' | Placeholder - no password needed |
| `public_key` | 'email-auth' | Placeholder - no key needed |
| `created_at` | Timestamp | When user record was created |
| `last_login` | NOW() | Current login time |
| `token` | NULL | (legacy field, not used) |
| `ip_address` | Client IP | e.g., "192.168.1.100" or IPv6 |
| `is_admin` | Boolean | TRUE for admin, FALSE for normal users |

### Existing User Update
```sql
UPDATE users
SET last_login = NOW()
WHERE email = 'user@example.com'
```

Updates the `last_login` timestamp for returning users.

## 2. During Questionnaire Submission (`POST /proust`)

When users submit their responses:

### Response Storage
```sql
INSERT INTO responses (user_id, question, answer)
VALUES (
  123,                                    -- User ID from users table
  'What is your idea of perfect happiness?',
  'User response here...'
)
```

**Stored in `responses` table:**
| Field | Value | Notes |
|-------|-------|-------|
| `id` | Auto-increment | Primary key |
| `user_id` | FK to users.id | Links to user record |
| `question` | Question text | The Proust question |
| `answer` | User response | Their answer |

## 3. NOT Saved to PostgreSQL

### Magic Link Tokens (In-Memory Only)
From `/backend/utils/db.js`:
```javascript
const magicLinkTokens = new Map(); // ❌ Not in database
```

**Stored in postgres:**
- Token: Random 64-character hex string
- Email: User's email address
- Expires: 10 minutes from creation


## Complete Flow with Database Writes

```
1. User enters email → POST /auth/request
   └─ ✓ IP address extracted from request
   └─ ✓ Check: Is admin email? → Bypass IP check
   └─ ✓ Check: IP already registered with a different email? → Block (403 error exlaining that a user from the same IP logged in with another email. Please contact Karuppacami if you believe this  to be in error: nirvikalpasamadhi@aformulationoftruth.com)
   └─  IP address saved to database
   └─ ✓ Token saved in  memory on vps
   └─ ✓ Email sent with magic link

2. User clicks magic link → GET /auth/verify?token=xxx
   └─ ✓ Token validated from memory
   └─ ✓ Token deleted from memory (one-time use)
   └─ ✓ IP address extracted from request
   └─ ✅ USER SAVED TO POSTGRESQL ← NEW!
      ├─ New user → INSERT with IP address and admin flag
      └─ Existing user → UPDATE last_login and IP address
   └─ ✓ JWT generated
   └─ ✓ Redirect to /questions?token=JWT

3. User submits questionnaire → POST /proust
   └─ ✓ JWT validated
   └─ ✅ RESPONSES SAVED TO POSTGRESQL
      └─ INSERT into responses table (multiple rows)
   └─ ✓ PDF generated (for Keybase users)
```

## Database Schema

### `users` Table
```sql
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  public_key TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP,
  token TEXT,
  ip_address TEXT,
  is_admin BOOLEAN DEFAULT FALSE
);
```

### `responses` Table
```sql
CREATE TABLE IF NOT EXISTS responses (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  question TEXT,
  answer TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
```

## Query Examples

### Find all responses for a user
```sql
SELECT r.question, r.answer, r.id
FROM responses r
JOIN users u ON u.id = r.user_id
WHERE u.email = 'user@example.com'
ORDER BY r.id;
```

### Find users who logged in today
```sql
SELECT email, last_login
FROM users
WHERE last_login::date = CURRENT_DATE
ORDER BY last_login DESC;
```

### Count responses per user
```sql
SELECT u.email, COUNT(r.id) as response_count
FROM users u
LEFT JOIN responses r ON r.user_id = u.id
GROUP BY u.id, u.email
ORDER BY response_count DESC;
```

### Find users with incomplete questionnaires
```sql
SELECT u.email, COUNT(r.id) as responses
FROM users u
LEFT JOIN responses r ON r.user_id = u.id
GROUP BY u.id, u.email
HAVING COUNT(r.id) < 35  -- Proust has 35 questions
ORDER BY responses DESC;
```

## Migration Notes

### For Existing In-Memory Tokens
persist magic link tokens in PostgreSQL:

```sql
CREATE TABLE IF NOT EXISTS magic_link_tokens (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Clean up expired tokens
DELETE FROM magic_link_tokens WHERE expires_at < NOW();
```

### For Better User Tracking
add:
```sql
-- Add index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Add index on user_id for response queries
CREATE INDEX IF NOT EXISTS idx_responses_user_id ON responses(user_id);

-- Add authentication method tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_method TEXT DEFAULT 'password';
-- Values: 'password', 'magic-link', 'keybase'
```

## Files Modified

1. ✅ `/backend/routes/auth.js` - Now saves users to PostgreSQL
2. ✅ `/backend/server.js` - Passes DB client to auth router
3. ✅ `/DATABASE_FLOW.md` - This documentation

## Testing Database Writes

### 1. Test User Creation
```bash
# Request magic link
curl -X POST http://localhost:8080/auth/request \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# Verify token (copy from server logs)
curl "http://localhost:8080/auth/verify?token=YOUR_TOKEN"

# Check database
psql -d your_database -c "SELECT * FROM users WHERE email='test@example.com';"
```

Expected output:
```
 id | username | email             | password_hash    | public_key | created_at | last_login
----+----------+-------------------+------------------+------------+------------+------------
  1 | test     | test@example.com  | magic-link-auth  | email-auth | 2025-...   | 2025-...
```

### 2. Test Response Storage
After logging in, submit questionnaire responses, then:
```bash
psql -d your_database -c "
  SELECT u.email, COUNT(r.id) as responses
  FROM users u
  LEFT JOIN responses r ON r.user_id = u.id
  WHERE u.email = 'test@example.com'
  GROUP BY u.email;
"
```

Expected output:
```
     email         | responses
-------------------+-----------
 test@example.com  |        35
```

## Summary

**What's saved to PostgreSQL:**
1. ✅ User records (on magic link verification)
2. ✅ Last login timestamps (on each login)
3. ✅ Questionnaire responses (on submission)

**What's NOT saved:**
1. ❌ Magic link tokens (in-memory only)
2. ❌ JWT tokens (stateless, not stored)
3. ❌ Failed login attempts (not tracked)

The database now properly persists user data and responses for the magic link authentication flow!
