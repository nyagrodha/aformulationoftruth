# Questionnaire Debug Plan

## Issues Identified

### Issue 1: Question Text Not Visible
**Root Cause**: API endpoint mismatch between frontend and backend

**Frontend (questionnaire.html:318)**:
- Calls: `/api/questions/next`
- Expected response: `{ text: "...", id: ... }`

**Backend (routes.ts)**:
- **Does NOT have** `/api/questions/next` endpoint
- Available endpoints:
  - `/api/questionnaire/session` - Get or create session
  - `/api/questionnaire/:sessionId/current` - Get current question
  - `/api/questionnaire/:sessionId/answer` - Submit answer

**Problem**: Frontend is calling a non-existent API endpoint, causing:
1. API call returns 404
2. `data.text` is undefined
3. Line 335: `document.getElementById('questionText').textContent = data.text;` sets empty text
4. Question container shows but with empty question text

### Issue 2: Answers Not Saving to Database
**Root Cause**: API endpoint mismatch and missing sessionId

**Frontend (questionnaire.html:387-394)**:
```javascript
const response = await fetch('/api/answers', {
    method: 'POST',
    headers,
    body: JSON.stringify({
        email: userEmail,
        questionId: currentQuestion.id,
        answer: answerText
    })
});
```

**Backend (routes.ts:118)**:
- **Does NOT have** `/api/answers` endpoint
- Correct endpoint: `/api/questionnaire/:sessionId/answer`
- Requires:
  - `sessionId` in URL path
  - `questionId` and `answer` in request body
  - **No email field** (user derived from auth token)

**Problem**: Frontend is calling wrong endpoint with wrong payload structure

## User Privacy & Identification

### Email Storage (schema.ts:18-34)
**Email is stored in PLAIN TEXT** in the users table:
```typescript
email: text("email").unique(),
```

**⚠️ PRIVACY ISSUE**: Currently, user emails are NOT hashed. They are stored as plain text with a unique constraint.

**Newsletter Emails (schema.ts:46-55)** - ENCRYPTED:
```typescript
encryptedEmail: text("encrypted_email").notNull(),
iv: text("iv").notNull(), // Initialization vector for AES-256-GCM
tag: text("tag").notNull(), // Authentication tag for AES-256-GCM
```
Newsletter emails ARE encrypted with AES-256-GCM before storage.

### Telegram ID Storage
**Currently NO Telegram authentication endpoint exists in backend**.

Frontend (index.html:208) calls `/api/auth/telegram` but this endpoint:
- ❌ Does NOT exist in routes.ts
- ❌ Does NOT exist in auth.ts
- ❌ Has NO database field for telegram_id

**Question: Would email AND telegram_id be saved for same user?**

**Answer**: Currently NO. The system has:
1. Magic link auth → creates user with email only
2. Telegram widget in frontend → calls non-existent API endpoint

**If Telegram auth were implemented**, the recommended approach would be:

#### Option A: Single User, Multiple Auth Methods
```typescript
// Enhanced users table schema
export const users = pgTable("users", {
  id: varchar("id").primaryKey(),
  email: text("email").unique().nullable(), // nullable for telegram-only users
  telegramId: text("telegram_id").unique().nullable(),
  telegramUsername: varchar("telegram_username"),
  // ... rest of fields
});
```

**User identification logic**:
- User authenticated by magic link: lookup by email
- User authenticated by Telegram: lookup by telegramId
- If email and telegramId both exist: allow linking accounts

#### Option B: Hashed Email for Privacy
```typescript
export const users = pgTable("users", {
  id: varchar("id").primaryKey(),
  emailHash: text("email_hash").unique(), // SHA-256 hash for recognition
  email: text("email").nullable(), // Optional: encrypted for contact purposes
  encryptedEmailIv: text("encrypted_email_iv"),
  encryptedEmailTag: text("encrypted_email_tag"),
  telegramId: text("telegram_id").unique().nullable(),
  // ... rest of fields
});
```

**Privacy benefits**:
- Email hash allows recognition of returning users
- Original email encrypted with AES-256-GCM
- Database breach doesn't expose plain emails
- Still allows "user exists" checks

## Recommended Privacy Improvements

### 1. Hash User Emails for Privacy
```typescript
import { createHash } from 'crypto';

function hashEmail(email: string): string {
  return createHash('sha256')
    .update(email.toLowerCase().trim())
    .digest('hex');
}

// When creating user:
const emailHash = hashEmail(email);
const encryptedEmail = encryptionService.encrypt(email);

await storage.createUser({
  emailHash,
  email: encryptedEmail.encrypted,
  emailIv: encryptedEmail.iv,
  emailTag: encryptedEmail.tag
});
```

### 2. Implement Telegram Authentication
```typescript
// Add to auth.ts:
app.post("/api/auth/telegram", async (req, res) => {
  try {
    const { id, first_name, last_name, username, photo_url, auth_date, hash } = req.body;

    // Verify Telegram auth (check hash signature)
    const verified = verifyTelegramAuth(req.body);
    if (!verified) {
      return res.status(401).json({ message: "Invalid Telegram authentication" });
    }

    // Find or create user
    let user = await storage.getUserByTelegramId(id.toString());
    if (!user) {
      user = await storage.createUser({
        telegramId: id.toString(),
        firstName: first_name,
        lastName: last_name,
        username: username
      });
    }

    // Create session
    req.session.userId = user.id;
    req.user = user;

    res.json({ user });
  } catch (error) {
    res.status(500).json({ message: "Telegram authentication failed" });
  }
});
```

## Solution Plan

### Fix 1: Update Frontend API Calls

#### Step 1: Add Session Management (questionnaire.html:196-275)
```javascript
let sessionId = null;

// Add after line 198 in init():
async function init() {
    detectLocation();

    // [Existing auth code...]

    // After authentication, get or create session
    if (authToken) {
        await getOrCreateSession();
    }
}

// New function to get/create session:
async function getOrCreateSession() {
    try {
        const headers = { 'Authorization': `Bearer ${authToken}` };
        const response = await fetch('/api/questionnaire/session', { headers });

        if (response.ok) {
            const session = await response.json();
            sessionId = session.id;
            console.log('Session initialized:', sessionId);
        } else {
            throw new Error('Failed to create session');
        }
    } catch (error) {
        showStatus('Error initializing session: ' + error.message, 'error');
    }
}
```

#### Step 2: Fix Question Fetching (questionnaire.html:311-347)
**Current**: `fetch('/api/questions/next')`
**Replace with**:
```javascript
async function fetchNextQuestion() {
    if (!sessionId) {
        showStatus('Session not initialized', 'error');
        return;
    }

    try {
        const headers = { 'Authorization': `Bearer ${authToken}` };
        const response = await fetch(`/api/questionnaire/${sessionId}/current`, { headers });

        if (response.status === 401) {
            handleUnauthorized();
            return;
        }

        const data = await response.json();
        document.getElementById('loading').style.display = 'none';

        if (!data.question) {
            // Questionnaire completed
            document.getElementById('completed').classList.remove('hidden');
        } else {
            currentQuestion = data.question;
            questionHistory.push(data.question);
            document.getElementById('questionText').textContent = data.question.text;
            document.getElementById('questionContainer').classList.remove('hidden');
            document.getElementById('answerText').focus();

            // Enable/disable previous button
            const prevBtn = document.getElementById('prevBtn');
            prevBtn.disabled = data.progress.current <= 1;
        }
    } catch (error) {
        showStatus('Error loading question: ' + error.message, 'error');
        document.getElementById('loading').style.display = 'none';
    }
}
```

#### Step 3: Fix Answer Submission (questionnaire.html:367-419)
**Current**: `fetch('/api/answers', { body: { email, questionId, answer } })`
**Replace with**:
```javascript
async function submitAnswer() {
    const answerText = document.getElementById('answerText').value.trim();

    if (!answerText) {
        showStatus('Please enter an answer', 'error');
        return;
    }

    if (!sessionId) {
        showStatus('Session not found', 'error');
        return;
    }

    const nextBtn = document.getElementById('nextBtn');
    const prevBtn = document.getElementById('prevBtn');
    nextBtn.disabled = true;
    prevBtn.disabled = true;
    nextBtn.textContent = 'Submitting...';

    try {
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`
        };

        const response = await fetch(`/api/questionnaire/${sessionId}/answer`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                questionId: currentQuestion.id,
                answer: answerText
            })
        });

        if (response.status === 401) {
            handleUnauthorized();
            return;
        }

        if (response.ok) {
            showStatus('Answer saved!', 'success');
            document.getElementById('answerText').value = '';
            document.getElementById('questionContainer').classList.add('hidden');
            document.getElementById('loading').style.display = 'block';
            setTimeout(fetchNextQuestion, 1000);
        } else {
            const errorData = await response.json();
            showStatus(errorData.message || 'Error saving answer', 'error');
        }
    } catch (error) {
        showStatus('Network error: ' + error.message, 'error');
    } finally {
        nextBtn.disabled = false;
        prevBtn.disabled = questionHistory.length <= 1;
        nextBtn.textContent = 'Next';
    }
}
```

### Fix 2: Backend Verification

#### Verify Database Schema
Check that the following tables exist with correct structure:

**sessions table** (for express-session):
- sid (primary key)
- sess (jsonb)
- expire (timestamp)

**users table**:
- id (primary key, UUID)
- email (text, unique) - **CURRENTLY PLAIN TEXT**
- firstName, lastName, profileImageUrl (optional)
- completionCount (integer, default 0)
- profileTier, encryptionType, publicKey, username, bio, profileVisibility
- createdAt, updatedAt (timestamps)

**Recommended addition for privacy**:
- emailHash (text, unique) - SHA-256 hash
- encryptedEmail (text) - AES-256-GCM encrypted
- emailIv (text) - Initialization vector
- emailTag (text) - Authentication tag
- telegramId (text, unique, nullable) - for Telegram auth

**questionnaire_sessions table**:
- id (primary key, UUID)
- userId (foreign key to users)
- questionOrder (jsonb array of question IDs)
- currentQuestionIndex (integer, default 0)
- completed (boolean, default false)
- completedAt (timestamp, nullable)
- wantsReminder (boolean, default false)
- isShared (boolean, default false)
- shareId (string, nullable, unique)
- createdAt, updatedAt (timestamps)

**responses table**:
- id (primary key, UUID)
- sessionId (foreign key to questionnaire_sessions)
- questionId (integer)
- answer (text)
- encryptionType (varchar, default "server")
- encryptedData, nonce (for client-side encryption)
- version, previousVersionId (for version history)
- createdAt, updatedAt (timestamps)

#### Verify Backend Endpoints Are Running
Test endpoints:
```bash
# Get/create session (requires auth token)
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/questionnaire/session

# Get current question (requires sessionId from above)
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/questionnaire/SESSION_ID/current

# Submit answer
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" -H "Content-Type: application/json" \
  -d '{"questionId": 1, "answer": "Test answer"}' \
  http://localhost:3000/api/questionnaire/SESSION_ID/answer
```

## Implementation Steps

1. ✅ **Analyze frontend code** - COMPLETED
2. ✅ **Analyze backend code** - COMPLETED
3. ✅ **Identify root causes** - COMPLETED
4. ✅ **Document privacy issues** - COMPLETED
5. ⏳ **Update questionnaire.html with fixes** - PENDING
6. ⏳ **Implement email hashing (optional but recommended)** - PENDING
7. ⏳ **Implement Telegram auth backend (optional)** - PENDING
8. ⏳ **Test authentication flow** - PENDING
9. ⏳ **Test question fetching** - PENDING
10. ⏳ **Test answer submission** - PENDING
11. ⏳ **Test database persistence** - PENDING
12. ⏳ **Test complete questionnaire flow** - PENDING

## Testing Checklist

- [ ] User can authenticate with magic link
- [ ] Session is created on page load
- [ ] First question displays correctly
- [ ] Question text is visible and readable
- [ ] User can type answer in textarea
- [ ] Answer submits successfully
- [ ] Next question loads after submission
- [ ] Previous button works correctly
- [ ] Answers persist in database (check directly)
- [ ] Progress is tracked correctly
- [ ] Questionnaire completion works
- [ ] PDF generation works on completion

## Database Queries to Verify

```sql
-- Check if sessions are being created
SELECT * FROM questionnaire_sessions ORDER BY "createdAt" DESC LIMIT 10;

-- Check if responses are being saved
SELECT s.id as session_id, r."questionId", r.answer, r."createdAt"
FROM questionnaire_sessions s
JOIN responses r ON r."sessionId" = s.id
ORDER BY r."createdAt" DESC
LIMIT 20;

-- Check user's progress
SELECT s.id, s."currentQuestionIndex",
       jsonb_array_length(s."questionOrder") as total_questions,
       COUNT(r.id) as answers_submitted
FROM questionnaire_sessions s
LEFT JOIN responses r ON r."sessionId" = s.id
WHERE s."userId" = 'USER_ID'
GROUP BY s.id;

-- Check if users table has email privacy (currently doesn't)
SELECT id, email, "telegramId", "createdAt" FROM users LIMIT 5;
```

## Key Files to Modify

### Frontend
1. `/var/www/aformulationoftruth/apps/frontend/public/questionnaire.html`
   - Lines 192-275: Add session management
   - Lines 311-347: Fix question fetching
   - Lines 367-419: Fix answer submission

### Backend (Optional Privacy Improvements)
1. `/var/www/aformulationoftruth/shared/schema.ts`
   - Add emailHash, encryptedEmail, emailIv, emailTag fields
   - Add telegramId field

2. `/var/www/aformulationoftruth/server/auth.ts`
   - Add `/api/auth/telegram` endpoint
   - Add email hashing logic

3. `/var/www/aformulationoftruth/server/storage.ts`
   - Add `getUserByTelegramId()` method
   - Update `createUser()` to handle hashed emails

## Privacy Summary

### Current State
- ❌ User emails stored in PLAIN TEXT
- ✅ Newsletter emails encrypted with AES-256-GCM
- ❌ No Telegram authentication
- ❌ No ability to link email + Telegram for same user

### Recommended Improvements
1. **Hash user emails** with SHA-256 for recognition
2. **Encrypt original email** with AES-256-GCM for contact
3. **Implement Telegram auth** endpoint
4. **Add telegramId** field to users table
5. **Allow account linking**: email OR telegram OR both

### Would Email + Telegram Be Saved for Same User?
**Current**: NO - system only supports email auth
**Recommended**: YES - add both fields:
```typescript
{
  id: "uuid",
  emailHash: "sha256_hash", // for recognition
  email: "encrypted_value", // encrypted for contact
  emailIv: "iv_value",
  emailTag: "tag_value",
  telegramId: "123456789", // nullable
  telegramUsername: "@username"
}
```

**User lookup logic**:
- Magic link: lookup by emailHash
- Telegram: lookup by telegramId
- Account linking: merge if both exist
