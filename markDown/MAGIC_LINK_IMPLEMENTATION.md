# Magic Link Authentication Implementation

## Overview
The questionnaire is now gated with magic link validation. Users must receive and click a magic link sent to their email before accessing the questionnaire.

## Architecture

### Frontend Files

#### `/public/index.html`
- Refactored main landing page
- Separated CSS and JavaScript into external files
- Loads authentication module first before other scripts

#### `/public/css/main.css`
- All styling for landing page, animations, and email portal
- Includes status message styles for success/error feedback

#### `/public/js/auth.js`
- Core authentication logic
- **Functions:**
  - `isUserValidated()` - Checks if user has valid magic link token
  - `validateMagicLinkToken()` - Validates token from URL parameter
  - `requestMagicLink(email)` - Requests magic link to be sent
  - `clearAuth()` - Clears authentication state

#### `/public/js/animations.js`
- Tamil text animation logic
- Neon glow effects
- Incarnation cycle animations
- No dependencies on auth system

#### `/public/js/questionnaire.js`
- Questionnaire entry logic with magic link validation
- Handles email input and submission
- Shows status messages for feedback
- Integrates with auth.js functions

#### `/public/js/main.js`
- Main application entry point
- Checks for magic link token on page load
- Initializes animations and questionnaire handlers

#### `/public/questionnaire-gate.html`
- Fallback page for users without validation
- Redirects validated users to questionnaire

## User Flow

### First-time User
1. User visits homepage
2. Watches Tamil text animations
3. Clicks "begin the questionnaire" link
4. Portal rush animation plays
5. Email portal appears requesting email address
6. User enters email and clicks "proceed into the questions"
7. Magic link is sent to their email
8. UI updates to show "Check your email" message
9. User clicks magic link in email
10. Token is validated and user is redirected to questionnaire
11. Token is stored in localStorage for future visits

### Returning User (with valid token)
1. User visits homepage
2. Token is detected in localStorage
3. User clicks "begin the questionnaire"
4. Immediately redirected to questionnaire (no email required)

### Magic Link Click
1. User clicks link with `?token=xxx` parameter
2. Page loads and validates token via API
3. If valid: stores token, redirects to questionnaire
4. If invalid: shows landing page normally

## API Endpoints Required

Your backend must implement these endpoints:

### POST `/api/auth/request-magic-link`
**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Magic link sent! Please check your email."
}
```

**Response (Error):**
```json
{
  "error": "Failed to send magic link. Please try again."
}
```

**Responsibilities:**
- Validate email format
- Generate unique token
- Store token with expiration (e.g., 15 minutes)
- Send email with magic link: `https://aformulationoftruth.com/?token=<TOKEN>`
- Return success/error response

### POST `/api/auth/validate-magic-link`
**Request:**
```json
{
  "token": "unique-token-here"
}
```

**Response (Success):**
```json
{
  "success": true,
  "email": "user@example.com"
}
```

**Response (Error):**
```json
{
  "error": "Invalid or expired token"
}
```

**Responsibilities:**
- Validate token exists and hasn't expired
- Return associated email address
- Optionally mark token as used (one-time use)

## LocalStorage Keys

- `magicLinkToken` - Stores the validated magic link token
- `userValidated` - Boolean flag ('true'/'false') indicating validation status
- `userEmail` - Stores the user's email address
- `pendingEmail` - Temporary storage while waiting for magic link

## Security Considerations

1. **Token Expiration**: Backend should expire tokens after 15-30 minutes
2. **One-time Use**: Optionally implement one-time use tokens
3. **Rate Limiting**: Backend should rate-limit magic link requests per email
4. **HTTPS Only**: Ensure all traffic uses HTTPS
5. **Token Length**: Use cryptographically secure random tokens (32+ characters)

## Testing

### Test Magic Link Flow
1. Enter email on homepage
2. Check backend logs for token generation
3. Copy magic link from logs (or email)
4. Visit magic link URL
5. Verify redirect to questionnaire
6. Check localStorage for tokens

### Test Validation
1. Clear localStorage
2. Try to access `/questionnaire` directly
3. Should be blocked or redirected

### Test Returning User
1. Complete magic link flow once
2. Close browser
3. Return to site
4. Click questionnaire link
5. Should bypass email step

## File Structure
```
/var/www/aformulationoftruth/public/
├── index.html (refactored)
├── index.html.backup (original backup)
├── questionnaire-gate.html (access denied page)
├── css/
│   └── main.css
└── js/
    ├── auth.js
    ├── animations.js
    ├── questionnaire.js
    └── main.js
```

## Next Steps

1. ✅ Frontend refactored and magic link UI implemented
2. ⏳ Implement backend API endpoints (`/api/auth/request-magic-link`, `/api/auth/validate-magic-link`)
3. ⏳ Set up email service for sending magic links
4. ⏳ Add questionnaire page validation to check `isUserValidated()`
5. ⏳ Test end-to-end flow

## Troubleshooting

**Magic link not working:**
- Check browser console for API errors
- Verify backend endpoints are responding
- Check token format in URL

**Animations not playing:**
- Check browser console for JavaScript errors
- Verify all script files are loading (Network tab)
- Clear browser cache

**Email not sending:**
- Check backend logs
- Verify email service configuration
- Check spam folder
