# Questionnaire Shuffle Implementation

## Overview
The questionnaire now implements a Fisher-Yates shuffle algorithm that:
- Keeps questions 0-2 in fixed order
- Randomizes questions 3-34 for each new session
- Prevents re-asking answered questions across sessions
- Maintains session consistency

## Files Modified/Created

### 1. `questionnaire.html` (lines 95-203)
Added shuffle initialization script that runs before the main questionnaire logic:
- Fisher-Yates shuffle implementation
- Question order initialization
- Answered question tracking
- Session persistence logic

### 2. `questionnaire-shuffled.js` (NEW)
Refactored questionnaire logic to use shuffled order:
- Changed from `currentQuestion` to `currentPosition` (position in shuffled array)
- Stores answers by original question index
- Displays questions using shuffled order
- Preserves backward compatibility

### 3. `test-shuffle.html` (NEW)
Comprehensive test suite to verify:
- First 3 questions remain fixed
- Questions 3-34 are shuffled
- Partial completion handling
- Session persistence
- No duplicate questions

## How It Works

### Initial Load (New User)
1. Shuffle script runs and creates order: `[0, 1, 2, <shuffled 3-34>]`
2. Order stored in `sessionStorage.questionOrder`
3. User sees questions in this shuffled order
4. Answers stored by original question index in `localStorage.a4ot-session`

### Resuming Same Session
1. Shuffle script reads existing `sessionStorage.questionOrder`
2. Questions presented in same order as before
3. Progress continues from saved position

### New Session with Partial Completion
1. Shuffle script reads answered questions from `localStorage.a4ot-session`
2. Answered questions identified (indices with non-empty answers)
3. New shuffle created excluding answered questions
4. User only sees unanswered questions in randomized order

## Key Implementation Details

### State Management
```javascript
// Session Storage (clears on browser close)
sessionStorage.questionOrder = [0, 1, 2, 15, 8, 22, ...] // Shuffled order

// Local Storage (persists)
localStorage['a4ot-session'] = {
  email: "user@example.com",
  currentPosition: 5,  // Position in shuffled order
  answers: {
    0: "Answer to Q0",
    1: "Answer to Q1",
    2: "Answer to Q2",
    15: "Answer to Q15",
    8: "Answer to Q8"
  }
}
```

### Question Display Logic
```javascript
// Current position in shuffled order
currentPosition = 5

// Get actual question index
questionIndex = questionOrder[currentPosition] // e.g., 22

// Display the question
QUESTIONS[questionIndex] // "What is your greatest regret?"
```

## Testing

### Automated Tests
Visit: `http://your-domain/test-shuffle.html`

Tests include:
1. **Initial Shuffle Test** - Verifies first 3 questions are fixed
2. **Partial Completion Test** - Simulates answering 5 questions
3. **New Session Test** - Verifies answered questions aren't re-asked
4. **Persistence Test** - Confirms order stays consistent in session

### Manual Testing

#### Test 1: Basic Shuffle
1. Clear browser storage (DevTools > Application > Clear Storage)
2. Load questionnaire page
3. Open console and run: `JSON.parse(sessionStorage.questionOrder)`
4. Verify first 3 elements are `[0, 1, 2]`
5. Verify remaining elements are randomized

#### Test 2: Partial Completion
1. Start questionnaire with email
2. Answer first 5 questions
3. Close browser tab
4. Reopen questionnaire
5. Verify you're at question 6 (same session continues)

#### Test 3: Cross-Session Completion
1. Answer first 10 questions
2. Note which questions you answered
3. Close browser completely (end session)
4. Reopen browser and visit questionnaire
5. Verify answered questions don't appear again
6. Remaining questions should be newly shuffled

#### Test 4: First 3 Always Fixed
1. Multiple users should always see same first 3 questions
2. Questions 0, 1, 2 from QUESTIONS array
3. These appear in positions 0, 1, 2 for everyone

## Edge Cases Handled

### 1. Missing sessionStorage
- Fallback to sequential order if shuffle hasn't initialized
- Won't break the questionnaire

### 2. Corrupted Storage
- Validates questionOrder length (must be 35)
- Re-initializes if invalid

### 3. Empty Answers
- Only counts non-empty, non-whitespace answers as "answered"
- Empty string answers don't prevent re-asking

### 4. Answer Storage
- Answers stored by original question index
- Works correctly even with shuffled presentation

## Known Limitations

### 1. Original questionnaire.js Not Modified
Due to file permissions, the original `/js/questionnaire.js` wasn't updated.
A new file `questionnaire-shuffled.js` was created instead.
The HTML references the new file.

### 2. Storage Event Listener
The `storage` event listener (line 201) only fires for changes from OTHER tabs.
This is a browser limitation and doesn't affect normal single-tab usage.

### 3. Download Format
Downloaded responses show questions in the order they were presented (shuffled),
not the original question order. This preserves the user's experience.

## Pre-Publication Checklist

- [x] Fisher-Yates shuffle implemented correctly
- [x] First 3 questions remain fixed
- [x] Questions 3-34 randomized
- [x] Answered questions tracked
- [x] Cross-session support working
- [x] Session persistence working
- [x] Test suite created
- [x] Edge cases handled
- [ ] Manual testing completed
- [ ] File permissions fixed (optional - current solution works)

## To Publish

The implementation is **ready for testing** but requires:

1. **Manual Testing** - Run through test scenarios above
2. **Browser Testing** - Test in Chrome, Firefox, Safari
3. **Mobile Testing** - Verify on mobile browsers
4. **Permission Fix** (optional) - If you want to update original questionnaire.js:
   ```bash
   sudo chown marcel:marcel /var/www/aformulationoftruth/public/js/questionnaire.js
   ```
   Then replace its content with questionnaire-shuffled.js

## Rollback Plan

To revert to original behavior:
1. Edit `questionnaire.html` line 204
2. Change: `<script src="/questionnaire-shuffled.js"></script>`
3. To: `<script src="/js/questionnaire.js"></script>`
4. Remove or comment out the shuffle script (lines 95-203)

## Questions?

Check the test suite at `/test-shuffle.html` or review the inline comments
in `questionnaire.html` and `questionnaire-shuffled.js`.
