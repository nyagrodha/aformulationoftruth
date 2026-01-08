# AI Agent Instructions for aformulationoftruth

## Project Overview
A web application for administering the Proust Questionnaire with a focus on self-inquiry and contemplative practice. Built with Express.js backend, React frontend, and PostgreSQL database.

## Core Architecture

### Project Structure
```
/
├── backend/           # Express.js + TypeScript server
│   ├── services/     # Core business logic services
│   ├── utils/        # Shared utilities
│   └── routes.ts     # API route definitions
├── frontend/         # React frontend (Create React App)
├── client/          # Alternative TypeScript + Vite frontend
└── shared/          # Cross-cutting types and schemas
```

### Key Components

1. **Authentication System**
   - Magic link based auth (see `backend/utils/email.js`)
   - Uses nodemailer with customizable SMTP config
   - MJML templates for email rendering

2. **Questionnaire Flow**
   - Session-based question management
   - Randomized question ordering
   - Progress tracking and resumption

3. **Results Processing**
   - PDF generation of responses
   - Email delivery with contemplative context
   - Response analytics and storage

## Development Patterns

### Environment Configuration
Required variables:
```
SMTP_HOST=smtp.mail.me.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
FROM_EMAIL=
```

### Database Schema
- Uses Drizzle ORM with PostgreSQL
- Core tables defined in `shared/schema.ts`:
  - `sessions`: Required for auth
  - `users`: User profiles and metadata
  - `responses`: Questionnaire answers

### Testing Strategy
- Backend: Jest tests in `/tests`
- API Integration tests
- Frontend component tests

## Common Workflows

### Adding New Questions
1. Update `backend/services/questionService.ts`
2. Add validation in `shared/schema.ts`
3. Update frontend display components

### Email Template Changes
1. Modify templates in `backend/templates/`
2. Use MJML for responsive email designs
3. Test with `renderTemplate()` utility

### Authentication Flow
1. User requests magic link
2. System generates timed token
3. Email sent with contemplative context
4. Token validates on click-through

## Integration Points

### External Services
- SMTP server for emails
- PostgreSQL database
- PDF generation service

### Internal APIs
- Question management API
- Response submission endpoints
- User session handling

## Important Code Patterns

### Error Handling
```typescript
try {
  await emailService.sendCompletionEmail(email, pdfBuffer);
} catch (error) {
  logger.error('Email sending failed:', error);
  // Always provide meaningful error responses
  throw new AppError('Failed to send completion email', 500);
}
```

### Data Validation
```typescript
// Always use Zod schemas from shared/schema.ts
const response = insertResponseSchema.parse(req.body);
```

### Service Pattern
```typescript
// Services are singleton classes with clear responsibilities
class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({...});
  }
  
  async sendMagicLink(to: string, link: string): Promise<void> {...}
}
```

## Key Files to Review
- `backend/routes.ts`: Main API structure
- `shared/schema.ts`: Data models and validation
- `backend/services/*.ts`: Core business logic
- `backend/utils/email.js`: Auth email handling

## Pitfalls to Avoid
1. Never hardcode email templates - use MJML system
2. Always validate responses against shared schemas
3. Use proper error handling in async routes
4. Remember to handle contemplative timing in email sends
