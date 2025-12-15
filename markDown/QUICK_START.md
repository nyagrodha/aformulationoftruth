# Quick Start Guide - Refactored Architecture

## 🚀 Getting Started

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Configure Environment
Make sure `.env.local` has these critical variables:
```env
JWT_SECRET=+Rw+suiD3UdO7++JahQMGpnYf5DkQPeum/uwidNbma2Nh4q0xOvNubZo4BbjHvmj1JER2gmrY5ogLzyZcjCUYQ==
PG_HOST=10.99.0.2
PG_PORT=5432
PG_DATABASE=a4m_db
PG_USER=a4m_app
PG_PASSWORD=jsT@sA2nd1nsd3cl2y0
```

### 3. Switch to New Server
```bash
# Backup current server (if needed)
cp backend/server.ts backend/server.old.ts

# Use refactored server
cp backend/server.new.ts backend/server.ts

# Start server
npm run dev
```

---

## 📁 New File Structure

### Configuration
```
backend/config/
├── environment.ts    # All environment variables
├── database.ts       # Database connection & schema
├── middleware.ts     # Express middleware setup
└── routes.ts         # Route mounting
```

### Utilities
```
backend/utils/
├── shared/
│   ├── username.ts   # Username generation
│   └── validation.ts # Input validation
└── logger.ts         # Winston logging
```

### Middleware
```
backend/middleware/
├── errors/
│   ├── AppError.ts      # Custom error classes
│   └── errorHandler.ts  # Error handling middleware
└── validators/
    └── common.ts        # Express-validator rules
```

### Schedulers
```
backend/schedulers/
└── tokenCleanup.ts   # Periodic token cleanup
```

---

## 🎯 Common Tasks

### Using Configuration
```typescript
import { config } from './config/environment.js';

// Access any config value
const port = config.server.port;
const dbHost = config.database.host;
const jwtSecret = config.auth.jwtSecret;
```

### Using Shared Utilities
```typescript
import { generateHashedUsername, isValidEmail } from './utils/shared/username.js';
import { isValidEmail, sanitizeText } from './utils/shared/validation.js';

// Generate username
const username = generateHashedUsername(email, config.auth.jwtSecret);

// Validate email
if (!isValidEmail(email)) {
  throw new ValidationError('Invalid email');
}
```

### Using Logger
```typescript
import { log } from './utils/logger.js';

log.info('User logged in', { userId, email });
log.error('Database error', { error });
log.warn('Rate limit approaching', { ip });
log.debug('Request received', { body: req.body });
```

### Using Error Classes
```typescript
import {
  ValidationError,
  AuthenticationError,
  NotFoundError
} from './middleware/errors/AppError.js';

// Throw specific errors
if (!email) {
  throw new ValidationError('Email is required');
}

if (!user) {
  throw new NotFoundError('User not found');
}

if (!validToken) {
  throw new AuthenticationError('Invalid token');
}
```

### Using Validators
```typescript
import {
  validateEmail,
  validateAnswerText,
  handleValidationErrors
} from './middleware/validators/common.js';
import { asyncHandler } from './middleware/errors/errorHandler.js';

// Apply validation to routes
app.post('/api/answers',
  validateEmail(),
  validateQuestionId(),
  validateAnswerText(),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    // Inputs are validated, safe to use
    const { email, questionId, answer } = req.body;
    // ... your logic
  })
);
```

### Using Async Handler
```typescript
import { asyncHandler } from './middleware/errors/errorHandler.js';

// Wrap async route handlers
app.get('/api/users/:id', asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    throw new NotFoundError('User not found');
  }
  res.json(user);
  // Errors automatically caught and handled
}));
```

---

## 🔍 Debugging

### Check Logs
```bash
# Error logs only
tail -f backend/logs/error.log

# All logs
tail -f backend/logs/combined.log
```

### Verify Configuration
```bash
cd backend
node -e "import('./config/environment.js').then(m => console.log(m.config))"
```

### Test Database Connection
```bash
cd backend
node -e "import('./config/database.js').then(m => m.connectAndInitialize())"
```

---

## ⚠️ Troubleshooting

### Server Won't Start
1. Check environment variables are set
2. Verify database is running
3. Check logs for errors
4. Ensure port 5742 is available

### TypeScript Errors
```bash
# Rebuild TypeScript
npm run build

# Check for type errors
npx tsc --noEmit
```

### Database Connection Failed
1. Verify `PG_*` env variables
2. Check database is running: `docker ps`
3. Test connection manually: `psql -h 10.99.0.2 -U a4m_app -d a4m_db`

### Module Not Found Errors
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

---

## 📊 Monitoring

### Health Check
```bash
curl http://localhost:5742/api/ping
# Should return: {"pong":true,"timestamp":"..."}
```

### Check Running Processes
```bash
pm2 status
pm2 logs backend
```

---

## 🎨 Best Practices

### 1. Always Use Config
```typescript
// ❌ Don't
const port = process.env.PORT || 3000;

// ✅ Do
import { config } from './config/environment.js';
const port = config.server.port;
```

### 2. Use Shared Utilities
```typescript
// ❌ Don't duplicate code
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ✅ Use shared utility
import { isValidEmail } from './utils/shared/validation.js';
```

### 3. Use Structured Logging
```typescript
// ❌ Don't
console.log('User logged in:', userId);

// ✅ Do
import { log } from './utils/logger.js';
log.info('User logged in', { userId, email });
```

### 4. Use Error Classes
```typescript
// ❌ Don't
throw new Error('User not found');

// ✅ Do
import { NotFoundError } from './middleware/errors/AppError.js';
throw new NotFoundError('User not found');
```

### 5. Validate Input
```typescript
// ❌ Don't trust input
app.post('/api/data', (req, res) => {
  const data = req.body; // Unsafe!
});

// ✅ Validate first
app.post('/api/data',
  validateEmail(),
  validateTextField('name', 1, 100),
  handleValidationErrors,
  asyncHandler(async (req, res) => {
    const data = req.body; // Safe, validated
  })
);
```

---

## 📚 Further Reading

- [REFACTORING_SUMMARY.md](./REFACTORING_SUMMARY.md) - Complete refactoring details
- [Winston Logging](https://github.com/winstonjs/winston)
- [Express Validator](https://express-validator.github.io/)
- [TypeScript Strict Mode](https://www.typescriptlang.org/tsconfig#strict)

---

## 🆘 Need Help?

1. Check `REFACTORING_SUMMARY.md` for detailed documentation
2. Review error logs in `backend/logs/`
3. Verify environment variables in `.env.local`
4. Test individual components separately
5. Revert to `server.old.ts` if critical issues occur
