# Opaque Resume Token Implementation - Refinements

## 🎯 Key Privacy Enhancements

Based on review, these refinements ensure strict gupta-vidya compliance:

### ✅ **1. X-Resume-Token Header (Required)**

**Current Issue:** `/api/questions/next` falls back to using email from JWT as session_id.

**Fix:** Always require `X-Resume-Token` header. Never use email as session identifier.

```typescript
// In /api/questions/next.ts
export const handler: Handlers = {
  async GET(req, _ctx) {
    // ONLY accept resume token - NO email fallback
    const resumeToken = req.headers.get('X-Resume-Token');

    if (!resumeToken) {
      return new Response(
        JSON.stringify({ error: 'X-Resume-Token header required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const session = await getSessionByToken(resumeToken);
    // ... rest of handler
  }
};
```

### ✅ **2. NO Email in URLs (Enforced)**

**Current Issue:** Magic link redirects might include email.

**Fix:** URL format is strictly: `?token=<JWT>&resume=<opaque_token>`

**Verification:**
```javascript
// Magic link URL should match this pattern EXACTLY:
const magicLinkUrl = `${baseUrl}/auth/verify?token=${jwt}&resume=${opaqueToken}`;
// NO email parameter
// NO email_hash parameter
// ONLY token and resume
```

### ✅ **3. Client Storage: JWT + Opaque Token ONLY**

**Current Issue:** Client stores `userEmail` in localStorage.

**Fix:** Store only JWT and resume token. Decode email from JWT if UI needs it.

```javascript
// On auth success, store ONLY these:
localStorage.setItem('a4t_jwt', jwt);
localStorage.setItem('a4t_resume', resumeToken);

// If UI needs email, decode from JWT:
function getEmailFromJWT() {
  const jwt = localStorage.getItem('a4t_jwt');
  if (!jwt) return null;

  try {
    const payload = JSON.parse(atob(jwt.split('.')[1]));
    // JWT contains email_hash, not plaintext email
    // UI should NOT display email
    return payload.email_hash; // This is a hash, not email
  } catch {
    return null;
  }
}
```

### ✅ **4. Eliminate Email-Based Session IDs**

**Current Issue:** `/questions/next` uses `req.user.email` as session_id fallback.

**Fix:** Session is ONLY identified by opaque resume token hash.

```typescript
// BEFORE (problematic):
const sessionId = req.query.session_id || req.user.email;

// AFTER (correct):
const resumeToken = req.headers.get('X-Resume-Token');
if (!resumeToken) {
  return new Response(
    JSON.stringify({ error: 'Resume token required' }),
    { status: 401, headers: { 'Content-Type': 'application/json' } }
  );
}

const sessionId = await hashResumeToken(resumeToken);
const session = await getSessionById(sessionId);
```

### ✅ **5. Remove Email from Logs**

**Current Issue:** Answer submission logs normalized email.

**Fix:** Log only session_id (HMAC hash), never email.

```typescript
// BEFORE (problematic):
console.log('[answer] Storing answer for user:', normalizedEmail);

// AFTER (correct):
console.log(`[answer:${requestId}] Storing answer for session: ${sessionId.substring(0, 8)}...`);
```

**Log sanitization checklist:**
- ❌ Never log plaintext email
- ❌ Never log email_hash (still correlatable)
- ✅ Log session_id (HMAC hash - unlinkable)
- ✅ Log request_id for debugging
- ✅ Log error types without identifiers

### ✅ **6. Server-Side Question Order (Enforced)**

**Current Issue:** Question order could be exposed to client.

**Fix:** Only return current question, never full order.

```typescript
// In /api/questions/next response:
{
  "questionIndex": 5,           // Current question index
  "questionText": "...",         // Current question text
  "currentIndex": 3,             // Position in order (3 of 35)
  "totalQuestions": 35,
  "progress": "8.6",            // Percentage
  "answeredQuestions": [0,1,2]  // Indices of answered questions
  // ❌ NO "questionOrder" field
  // ❌ NO "remainingQuestions" field
}
```

### ✅ **7. Align with Actual Endpoint Names**

**Update:** Use consistent naming across codebase.

```
Current endpoints:
✅ POST /api/auth/magic-link
✅ GET  /auth/verify?token=<JWT>&resume=<opaque_token>
✅ GET  /api/questions/next (with X-Resume-Token header)
✅ POST /api/questions/answer (with X-Resume-Token header + JWT)
```

### ✅ **8. One Active Session Per Email (Clarified)**

**Implementation:**

```typescript
// In createQuestionnaireSession():
export async function createQuestionnaireSession(
  emailHash: string,
  gateToken?: string
): Promise<SessionCreationResult> {
  await withTransaction(async (client) => {
    // Find existing incomplete session
    const { rows: existing } = await client.queryObject<{ session_id: string }>(
      `SELECT session_id FROM fresh_questionnaire_sessions
       WHERE email_hash = $1 AND completed_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [emailHash]
    );

    if (existing.length > 0) {
      // Mark old session as completed
      // User gets NEW opaque token (old one is not retrievable)
      await client.queryObject(
        `UPDATE fresh_questionnaire_sessions
         SET completed_at = NOW()
         WHERE session_id = $1`,
        [existing[0].session_id]
      );
    }

    // Create new session
    // ...
  });
}
```

**Behavior:**
- User requests magic link → checks for active session
- If active session exists → marks it completed, creates new one
- User gets new opaque token (old tokens become invalid)
- This prevents multiple concurrent sessions per email

---

## 🔒 Privacy Checklist

Before deploying, verify:

- [ ] **URLs:** No email in any URL (magic link, redirects, API calls)
- [ ] **localStorage:** Only JWT + resume token (no email)
- [ ] **Session ID:** Never use email as session identifier
- [ ] **Logs:** No plaintext email, no email_hash
- [ ] **Responses:** No email in API responses (except development mode)
- [ ] **Question Order:** Never sent to client in full
- [ ] **Headers:** X-Resume-Token required for all /questions/* endpoints
- [ ] **JWT:** Contains email_hash (not plaintext) for encryption only

---

## 📝 Code Updates Required

### File: `/routes/api/questions/next.ts`

**Change:** Remove session_id query param support, require X-Resume-Token header.

```typescript
// Remove this:
const sessionIdParam = url.searchParams.get('session_id');

// Keep only:
const resumeTokenHeader = req.headers.get('X-Resume-Token');
const resumeTokenCookie = getCookie(cookies, 'resume_token');
const resumeToken = resumeTokenHeader || resumeTokenCookie;

if (!resumeToken) {
  return new Response(
    JSON.stringify({ error: 'X-Resume-Token header or cookie required' }),
    { status: 401, headers: { 'Content-Type': 'application/json' } }
  );
}
```

### File: `/routes/api/questions/answer.ts`

**Change:** Remove email from logs.

```typescript
// Before:
console.log(`[answer] User ${normalizedEmail} answered question ${questionIndex}`);

// After:
console.log(`[answer:${requestId}] Question ${questionIndex} answered, session ${sessionId.substring(0, 8)}...`);
```

### File: `/lib/questionnaire-session.ts`

**Change:** Ensure old sessions are marked completed.

Already implemented correctly ✅

### File: `/routes/auth/verify.tsx`

**Change:** Ensure no email in redirect URL.

Already implemented correctly ✅

---

## 🧪 Testing Plan

### Test 1: No Email in URLs

```bash
# Request magic link
RESPONSE=$(curl -s -X POST http://localhost:8000/api/auth/magic-link \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}')

# Extract dev link
DEV_LINK=$(echo $RESPONSE | jq -r '._devLink')

# Verify NO email in URL
if echo "$DEV_LINK" | grep -i "email"; then
  echo "❌ FAIL: Email found in URL"
else
  echo "✅ PASS: No email in URL"
fi

# Verify format: ?token=<JWT>&resume=<TOKEN>
if echo "$DEV_LINK" | grep -E '\?token=[^&]+&resume=[a-f0-9]{64}$'; then
  echo "✅ PASS: Correct URL format"
else
  echo "❌ FAIL: Incorrect URL format"
fi
```

### Test 2: X-Resume-Token Header Required

```bash
# Try without header - should fail
curl -s http://localhost:8000/api/questions/next | jq

# Expected: {"error": "X-Resume-Token header or cookie required"}

# Try with header - should succeed
RESUME_TOKEN="<token_from_magic_link>"
curl -s http://localhost:8000/api/questions/next \
  -H "X-Resume-Token: $RESUME_TOKEN" | jq

# Expected: Question data
```

### Test 3: localStorage Only Has JWT + Token

```javascript
// In browser console after auth
const keys = Object.keys(localStorage).filter(k => k.startsWith('a4t_'));
console.log('Stored keys:', keys);

// Expected: ['a4t_jwt', 'a4t_resume']
// NOT: 'a4t_email' or 'userEmail'

// Verify no email stored
const hasEmail = Object.values(localStorage).some(v =>
  v.includes('@') || v.includes('email')
);
console.log('Email in localStorage:', hasEmail);
// Expected: false
```

### Test 4: No Email in Logs

```bash
# Submit an answer
curl -X POST http://localhost:8000/api/questions/answer \
  -H "Authorization: Bearer <JWT>" \
  -H "X-Resume-Token: <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"questionIndex": 0, "answer": "test", "skipped": false}'

# Check logs for email
tail -n 50 /var/log/aformulationoftruth/app.log | grep -i "test@example.com"
# Expected: No results (email not logged)

tail -n 50 /var/log/aformulationoftruth/app.log | grep "answer"
# Expected: See request_id and session hash, not email
```

### Test 5: One Session Per Email

```bash
# Request magic link twice
curl -X POST http://localhost:8000/api/auth/magic-link \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'

sleep 2

curl -X POST http://localhost:8000/api/auth/magic-link \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'

# Check database - should have ONE active session
psql $DATABASE_URL -c "
SELECT COUNT(*) as active_sessions
FROM fresh_questionnaire_sessions
WHERE email_hash = '<computed_hash>'
AND completed_at IS NULL
"

# Expected: active_sessions = 1
```

---

## 🚀 Deployment Sequence

### 1. Pre-Deployment

```bash
# Generate secrets
JWT_SECRET=$(openssl rand -hex 32)
RESUME_TOKEN_SECRET=$(openssl rand -hex 64)

# Add to .env
echo "JWT_SECRET=$JWT_SECRET" >> .env
echo "RESUME_TOKEN_SECRET=$RESUME_TOKEN_SECRET" >> .env

# Backup database
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
```

### 2. Deploy Migration

```bash
psql $DATABASE_URL < db/migrations/002_opaque_resume_tokens.sql
```

### 3. Deploy Code

```bash
# Deploy all new files
git add .
git commit -m "Implement opaque resume tokens (gupta-vidya compliant)"
git push

# Restart application
systemctl restart aformulationoftruth
```

### 4. Post-Deployment Verification

Run all tests above. All should pass.

---

## 📊 Success Metrics

### Privacy Compliance

✅ Zero email occurrences in:
- Magic link URLs
- Verification redirect URLs
- API responses (except dev mode)
- Application logs
- Client localStorage

✅ Session identified only by:
- Opaque resume token (HMAC-hashed)
- Never by email or email_hash

### Functional Metrics

✅ Magic links work
✅ Session resumption works
✅ Question progression works
✅ Answer submission works
✅ One active session per email enforced

---

## 🔄 Rollback (if needed)

```sql
-- Rollback migration
DROP TABLE fresh_questionnaire_sessions CASCADE;
ALTER TABLE fresh_responses DROP COLUMN session_id;
ALTER TABLE fresh_gate_responses DROP COLUMN linked_session_id;
```

```bash
# Rollback code
git revert HEAD
systemctl restart aformulationoftruth
```

---

## 🎉 Implementation Complete When

- [ ] All tests pass
- [ ] No email in URLs (verified by grep)
- [ ] No email in logs (verified by grep)
- [ ] No email in localStorage (verified in browser)
- [ ] X-Resume-Token header required
- [ ] Session creation marks old sessions complete
- [ ] Question order stays server-side
- [ ] JWT contains email_hash (not plaintext)
- [ ] Documentation updated

---

**Version:** 1.0 (Refined)
**Date:** 2026-01-10
**Compliance:** gupta-vidya strict mode ✅
