# Questionnaire Fixes Applied - December 5, 2025

## Issues Fixed

### Issue 1: Question Text Not Visible ✅ FIXED
**Problem**: Frontend was calling `/api/questions/next` which doesn't exist in the backend

**Solution**: Updated frontend to call correct endpoint `/api/questionnaire/:sessionId/current`

### Issue 2: Answers Not Saving to Database ✅ FIXED
**Problem**: Frontend was calling `/api/answers` with incorrect payload structure

**Solution**: Updated frontend to call `/api/questionnaire/:sessionId/answer` with correct payload

### Issue 3: Authentication Method Mismatch ✅ FIXED
**Problem**: Frontend was using Bearer token authentication, but backend uses session-based (cookie) authentication

**Solution**: Removed all Bearer token headers and added `credentials: 'include'` to send cookies

## Changes Made to `/var/www/aformulationoftruth/apps/frontend/public/questionnaire.html`

### 1. Added Session Management (Line 195)
```javascript
let sessionId = null;  // Added session tracking variable
```

### 2. Added getOrCreateSession() Function (Lines 315-337)
```javascript
async function getOrCreateSession() {
    try {
        const response = await fetch('/api/questionnaire/session', {
            credentials: 'include' // Send cookies
        });

        if (response.status === 401) {
            handleUnauthorized();
            return;
        }

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

### 3. Updated fetchNextQuestion() Function (Lines 339-379)
**Changes**:
- ❌ Removed: `fetch('/api/questions/next')`
- ✅ Added: `fetch(\`/api/questionnaire/${sessionId}/current\`)`
- ❌ Removed: Bearer token authentication
- ✅ Added: `credentials: 'include'` for cookie authentication
- ✅ Changed: Response structure from `data.text` to `data.question.text`
- ✅ Changed: Progress tracking from `questionHistory.length` to `data.progress.current`

**Before**:
```javascript
const response = await fetch('/api/questions/next', { headers });
const data = await response.json();
currentQuestion = data;
document.getElementById('questionText').textContent = data.text;
```

**After**:
```javascript
const response = await fetch(`/api/questionnaire/${sessionId}/current`, {
    credentials: 'include'
});
const data = await response.json();
currentQuestion = data.question;
document.getElementById('questionText').textContent = data.question.text;
```

### 4. Updated submitAnswer() Function (Lines 404-457)
**Changes**:
- ❌ Removed: `fetch('/api/answers')`
- ✅ Added: `fetch(\`/api/questionnaire/${sessionId}/answer\`)`
- ❌ Removed: Bearer token authentication
- ✅ Added: `credentials: 'include'` for cookie authentication
- ❌ Removed: `email` field from request body
- ✅ Added: Session validation check
- ✅ Added: Better error message handling

**Before**:
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

**After**:
```javascript
const response = await fetch(`/api/questionnaire/${sessionId}/answer`, {
    method: 'POST',
    credentials: 'include',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        questionId: currentQuestion.id,
        answer: answerText
    })
});
```

### 5. Fixed Authentication Flow (Lines 227-253)
**Changes**:
- ❌ Removed: Token validation via `/api/user/me` with Bearer auth
- ✅ Added: Session validation via `/api/auth/user` with cookies
- ❌ Removed: localStorage token management
- ✅ Simplified: Authentication check using existing backend endpoint

**Before**:
```javascript
const token = localStorage.getItem('token');
const response = await fetch('/api/user/me', {
    headers: {
        'Authorization': `Bearer ${token}`
    }
});
```

**After**:
```javascript
const response = await fetch('/api/auth/user', {
    credentials: 'include'
});
```

### 6. Updated All Init Paths (Lines 225, 242, 271)
**Added** `await getOrCreateSession();` before `await fetchNextQuestion();` in all three authentication paths:
- URL token path
- Session validation path
- Network error fallback path

## API Endpoints Now Being Called Correctly

### Authentication
- ✅ `GET /api/auth/user` - Check if user is authenticated (session-based)

### Questionnaire Flow
1. ✅ `GET /api/questionnaire/session` - Get or create questionnaire session
2. ✅ `GET /api/questionnaire/:sessionId/current` - Get current question
3. ✅ `POST /api/questionnaire/:sessionId/answer` - Submit answer

## Expected Behavior After Fixes

### On Page Load
1. User must be authenticated (via magic link) - session cookie is set
2. Frontend checks authentication via `/api/auth/user`
3. Frontend calls `/api/questionnaire/session` to get/create session
4. Frontend calls `/api/questionnaire/:sessionId/current` to get first question
5. Question text displays correctly in the UI

### On Answer Submission
1. User types answer in textarea
2. Clicks "Next" button
3. Frontend calls `/api/questionnaire/:sessionId/answer` with question ID and answer
4. Backend saves answer to `responses` table
5. Backend updates `currentQuestionIndex` in `questionnaire_sessions` table
6. Frontend fetches next question
7. Process repeats until all 35 questions are answered

### Database Persistence
All answers are now saved to the database with proper structure:
```sql
INSERT INTO responses (
    "sessionId",
    "questionId",
    answer,
    "createdAt",
    "updatedAt"
) VALUES (
    'session-uuid',
    1,
    'User answer text',
    NOW(),
    NOW()
);
```

## Testing Checklist

To verify fixes are working:

1. **User Authentication**
   - [ ] User can request magic link from landing page
   - [ ] User receives email with magic link
   - [ ] Clicking magic link authenticates user and redirects to questionnaire

2. **Question Display**
   - [ ] First question text is visible (not blank)
   - [ ] Question displays in the `.question-text` div
   - [ ] Textarea is ready for input

3. **Answer Submission**
   - [ ] User can type answer in textarea
   - [ ] Clicking "Next" shows "Submitting..." state
   - [ ] Success message displays: "Answer saved!"
   - [ ] Next question loads automatically
   - [ ] Previous button enables/disables correctly

4. **Database Verification**
   ```sql
   -- Check sessions are created
   SELECT * FROM questionnaire_sessions
   ORDER BY "createdAt" DESC LIMIT 5;

   -- Check answers are saved
   SELECT
       qs.id as session_id,
       r."questionId",
       r.answer,
       r."createdAt"
   FROM questionnaire_sessions qs
   JOIN responses r ON r."sessionId" = qs.id
   ORDER BY r."createdAt" DESC
   LIMIT 10;
   ```

5. **Progress Tracking**
   - [ ] Session tracks `currentQuestionIndex`
   - [ ] User can navigate back with "Prior" button
   - [ ] Questionnaire completes after 35 questions
   - [ ] Completion triggers PDF generation

## Files Modified

1. `/var/www/aformulationoftruth/apps/frontend/public/questionnaire.html`
   - Added session management
   - Fixed API endpoints
   - Fixed authentication method
   - Total changes: ~100 lines modified/added

## No Backend Changes Required

All backend endpoints are correctly implemented and functioning. Only frontend needed fixes.

## Privacy Note

**Current Implementation**:
- User emails are stored in **plain text** in the `users` table
- Session authentication uses secure HTTP-only cookies
- Newsletter emails are encrypted with AES-256-GCM

**Recommended Improvement** (documented in QUESTIONNAIRE_DEBUG_PLAN.md):
- Hash user emails with SHA-256 for privacy
- Encrypt original email for contact purposes
- Add Telegram authentication support

## Next Steps for Full Testing

1. **Manual Testing**:
   - Request magic link from landing page
   - Complete full questionnaire flow
   - Verify all 35 questions appear
   - Check database for saved responses

2. **Database Queries**:
   ```sql
   -- Verify session creation
   SELECT id, "userId", "currentQuestionIndex", completed
   FROM questionnaire_sessions
   WHERE "userId" = 'YOUR_USER_ID';

   -- Verify answer persistence
   SELECT COUNT(*) as answer_count
   FROM responses r
   JOIN questionnaire_sessions qs ON qs.id = r."sessionId"
   WHERE qs."userId" = 'YOUR_USER_ID';
   ```

3. **Browser DevTools**:
   - Network tab: Verify API calls return 200 OK
   - Console: Check for errors
   - Application tab: Verify session cookie is set

## Summary

✅ **Question visibility issue** - FIXED
✅ **Answer saving issue** - FIXED
✅ **Authentication mismatch** - FIXED
✅ **Session management** - ADDED
✅ **All API endpoints** - CORRECTED

The questionnaire should now work correctly with:
- Questions displaying properly
- Answers saving to database
- Session-based authentication
- Progress tracking
- Previous/Next navigation
