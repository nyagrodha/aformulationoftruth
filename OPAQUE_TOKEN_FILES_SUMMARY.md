# Opaque Resume Token - Files Summary

## 📦 All Files Created/Modified

### **Database Migration**

#### `db/migrations/002_opaque_resume_tokens.sql`
- **Purpose:** Create questionnaire sessions table with opaque token architecture
- **Key features:**
  - `session_id` is HMAC-SHA256 hash (primary key)
  - No plaintext tokens stored
  - Links to `fresh_responses` and `fresh_gate_responses`
  - Tracks answered questions and progress server-side

---

### **Core Libraries**

#### `lib/jwt.ts` ✨ NEW
- **Purpose:** JWT creation and verification for questionnaire sessions
- **Key functions:**
  - `createQuestionnaireJWT(emailHash, sessionId)` - Create JWT with email_hash + session_id
  - `verifyQuestionnaireJWT(token)` - Verify and decode JWT
  - `isJWTExpired(token)` - Check expiration without full verification
- **Security:** HMAC-SHA256 signing, 24-hour validity

#### `lib/crypto.ts` ✏️ MODIFIED
- **Added functions:**
  - `generateResumeToken()` - Generate 256-bit random opaque token
  - `hashResumeToken(token)` - HMAC-SHA256 hash (becomes session_id)
  - `verifyResumeToken(token, storedHash)` - Constant-time verification

#### `lib/questionnaire-session.ts` ✨ NEW
- **Purpose:** Manage questionnaire sessions with opaque tokens
- **Key functions:**
  - `createQuestionnaireSession(emailHash, gateToken?)` - Create new session
  - `getSessionByToken(opaqueToken)` - Lookup by opaque token
  - `getSessionById(sessionId)` - Lookup by HMAC hash
  - `findActiveSession(emailHash)` - Find user's active session
  - `updateSessionProgress(sessionId, questionIndex, newIndex)` - Update progress
  - `completeSession(sessionId)` - Mark session complete
  - `storeSessionAnswers(sessionId, answers)` - Store final answers
  - `getNextQuestion(sessionId)` - Get next question details
- **Privacy:** Never uses email as session identifier

---

### **API Routes**

#### `routes/api/auth/magic-link.ts` ✏️ MODIFIED
- **Purpose:** Generate magic links with JWT + opaque token
- **Flow:**
  1. Hash email
  2. Create or resume session
  3. Generate JWT (email_hash + session_id)
  4. Generate opaque token
  5. Return URL: `?token=<JWT>&resume=<opaque_token>`
- **Privacy:** NO email in URL

#### `routes/auth/verify.tsx` ✏️ MODIFIED
- **Purpose:** Verify JWT + opaque token and redirect to questionnaire
- **Flow:**
  1. Extract JWT and resume token from URL
  2. Verify JWT signature
  3. Hash resume token to get session_id
  4. Verify session_id matches JWT
  5. Verify session exists
  6. Set cookies and redirect
- **Privacy:** NO email in URL or cookies

#### `routes/api/questions/next.ts` ✨ NEW
- **Purpose:** Get next question for session
- **Authentication:** Requires `X-Resume-Token` header or cookie
- **Response:** Current question text, index, progress
- **Privacy:** Never returns full question order

#### `routes/api/questions/answer.ts` ✨ NEW
- **Purpose:** Submit answer and advance progress
- **Authentication:** Requires JWT (Bearer token) + X-Resume-Token
- **Flow:**
  1. Verify JWT
  2. Verify resume token
  3. Verify tokens match
  4. Update session progress
  5. Return success + next index
- **Privacy:** No email in logs, only session_id hash

---

### **Configuration & Documentation**

#### `.env.example.opaque-tokens` ✨ NEW
- **Purpose:** Example environment configuration
- **Variables:**
  - `JWT_SECRET` - HMAC secret for JWT signing (256 bits)
  - `RESUME_TOKEN_SECRET` - HMAC secret for token hashing (512 bits)
- **Generation commands included**

#### `OPAQUE_TOKEN_IMPLEMENTATION.md` ✨ NEW
- **Purpose:** Comprehensive implementation guide with privacy refinements
- **Sections:**
  1. Key Privacy Enhancements (8 refinements)
  2. Privacy Checklist
  3. Code Updates Required
  4. Testing Plan (5 tests)
  5. Deployment Sequence
  6. Success Metrics
  7. Rollback Plan

---

## 🔄 Migration Path

### From Current (Email-based)
```
User → Magic Link → Email in URL → Session by email
```

### To New (Opaque Token)
```
User → Magic Link → JWT + Opaque Token → Session by HMAC hash
```

---

## 🔑 Key Architectural Changes

### Session Identification

**Before:**
```typescript
session_id = email_hash  // PII-linked
```

**After:**
```typescript
opaque_token = random(32 bytes)
session_id = HMAC(opaque_token, server_secret)  // Unlinkable
```

### Client Storage

**Before:**
```javascript
localStorage: {
  'userEmail': 'user@example.com',  // ❌ PII
  'token': '...',
  'questionOrder': '0,1,2,3,...'    // ❌ Exposed
}
```

**After:**
```javascript
localStorage: {
  'a4t_jwt': 'eyJhbGc...',          // ✅ Contains email_hash (hashed)
  'a4t_resume': 'a1b2c3...'         // ✅ Opaque token
}
```

### URL Structure

**Before:**
```
❌ /auth/verify?token=...&email=user@example.com
```

**After:**
```
✅ /auth/verify?token=<JWT>&resume=<opaque_token>
```

### API Headers

**Before:**
```
❌ /questions/next?session_id=user@example.com
```

**After:**
```
✅ /questions/next
   Headers: X-Resume-Token: a1b2c3d4...
```

---

## 📊 Database Schema Changes

### New Table: `fresh_questionnaire_sessions`

```sql
CREATE TABLE fresh_questionnaire_sessions (
  session_id VARCHAR(64) PRIMARY KEY,        -- HMAC hash of opaque token
  email_hash VARCHAR(64) NOT NULL,           -- Links to user
  question_order VARCHAR(200) NOT NULL,      -- Shuffled order
  answered_questions INTEGER[],              -- Progress tracking
  current_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,     -- NULL if active
  token_version INTEGER DEFAULT 1
);
```

### Updated Tables

**fresh_responses:**
- Added: `session_id VARCHAR(64)` - Links to session

**fresh_gate_responses:**
- Added: `linked_session_id VARCHAR(64)` - Links to session

---

## 🧪 Testing Checklist

### Privacy Tests
- [ ] No email in magic link URL
- [ ] No email in verification redirect URL
- [ ] No email in API responses (except dev mode)
- [ ] No email in application logs
- [ ] No email in localStorage
- [ ] No email in cookies

### Functional Tests
- [ ] Magic link creation works
- [ ] JWT verification works
- [ ] Resume token hashing works
- [ ] Session lookup works
- [ ] Question fetching works
- [ ] Answer submission works
- [ ] Progress tracking works
- [ ] Session completion works

### Security Tests
- [ ] Invalid JWT rejected
- [ ] Expired JWT rejected
- [ ] Invalid resume token rejected
- [ ] Token mismatch detected
- [ ] Session not found handled
- [ ] HMAC verification constant-time
- [ ] No token guessing possible

---

## 🚀 Deployment Order

1. ✅ Generate `JWT_SECRET` and `RESUME_TOKEN_SECRET`
2. ✅ Backup database
3. ✅ Run migration `002_opaque_resume_tokens.sql`
4. ✅ Deploy new code files
5. ✅ Restart application
6. ✅ Run test suite
7. ✅ Verify privacy compliance
8. ✅ Monitor logs for issues

---

## 📝 Environment Variables Required

```bash
# Add to .env
JWT_SECRET=<64-char-hex>              # Generated with: openssl rand -hex 32
RESUME_TOKEN_SECRET=<128-char-hex>    # Generated with: openssl rand -hex 64
```

---

## 🎯 Success Criteria

Deployment is successful when:

✅ All files deployed without errors
✅ Migration applied successfully
✅ Environment variables configured
✅ Magic links contain JWT + resume token
✅ No email in any URL
✅ No email in localStorage
✅ No email in logs
✅ Questions fetched via X-Resume-Token
✅ Answers submitted successfully
✅ Sessions resume correctly
✅ All tests pass

---

## 📚 Documentation Files

1. **OPAQUE_TOKEN_IMPLEMENTATION.md** - Complete implementation guide with privacy refinements
2. **OPAQUE_TOKEN_FILES_SUMMARY.md** - This file
3. **.env.example.opaque-tokens** - Environment configuration template

---

## 🔗 Related Files (Existing, Not Modified)

- `lib/auth.ts` - Magic link creation/verification (still used)
- `lib/db.ts` - Database connection pooling
- `lib/questionnaire.ts` - Question shuffling logic
- `lib/metrics.ts` - Metrics tracking
- `routes/questionnaire.tsx` - Questionnaire UI (will need client-side updates)
- `routes/login.tsx` - Login form

---

## 🎉 Implementation Status

✅ **Complete:**
- Database migration
- JWT utilities
- Crypto functions
- Session management
- API routes (next, answer)
- Auth routes (magic-link, verify)
- Documentation
- Testing plan

⏳ **Next Steps:**
1. Generate secrets
2. Apply migration
3. Deploy code
4. Run tests
5. Monitor logs

---

**Version:** 1.0
**Date:** 2026-01-10
**Architecture:** Opaque Resume Token (gupta-vidya compliant)
**Status:** Ready for deployment 🚀
