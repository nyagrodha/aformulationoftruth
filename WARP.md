# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Development Commands

### Primary Development
- `npm run dev` - Start development server (Vite frontend + Express backend on port 5000)
- `npm run build` - Build production assets
- `npm run preview` - Preview production build locally

### Frontend (React/TypeScript)
- `cd frontend && npm start` - Start Create React App dev server (port 3000, proxies to 3002)
- `cd frontend && npm run build` - Build React app for production
- `cd frontend && npm test` - Run frontend tests with Jest

### Backend (Express/TypeScript)
- `cd backend && node server.js` - Start Express server directly
- `cd backend && npm test` - Run backend tests (currently no tests configured)

### Database Operations
- `npx drizzle-kit generate` - Generate database migrations
- `npx drizzle-kit push` - Push schema changes to database
- `npx drizzle-kit studio` - Open Drizzle Studio for database management

### Production Deployment
- `systemctl start a4mula.service` - Start production service with systemd
- `systemctl stop a4mula.service` - Stop production service
- `systemctl restart a4mula.service` - Restart production service

### Testing Individual Components
- `npm test -- --testNamePattern="specific test"` - Run specific test
- `cd backend && node -e "require('./tests/test-file.js')"` - Run specific backend test file

## Architecture Overview

### Full-Stack Monorepo Structure
The application uses a modern monorepo architecture with distinct frontend and backend components but unified TypeScript configuration and shared schemas:

```
/aformulationoftruth
├── client/          # Vite React frontend (main UI)
├── frontend/        # Legacy Create React App (being phased out)
├── backend/         # Express API server (legacy, minimal usage)
├── server/          # Main TypeScript Express server
├── shared/          # Shared TypeScript schemas and types
└── vps-server/      # Secure storage API for VPS backup
```

### Core Technologies
- **Frontend**: React 18 + TypeScript, Vite build system, Wouter routing, TanStack Query
- **Backend**: Express + TypeScript, Drizzle ORM with PostgreSQL
- **UI**: Radix UI primitives with shadcn/ui, Tailwind CSS, custom Garamond typography
- **Auth**: Replit Auth (OAuth) with magic link fallback
- **Database**: Neon PostgreSQL with session-based storage

### Data Flow Architecture
1. **Authentication**: Replit OAuth → Session creation → User registration/login
2. **Questionnaire Engine**: 35-question philosophical questionnaire with intelligent randomization
3. **Response Processing**: Real-time validation → Database storage → PDF generation → Email delivery
4. **Backup System**: AES-256-GCM encrypted backup to secure VPS storage

## Key Application Components

### Question Management System
- **Fixed Positioning**: Questions 1 (start), 18 (middle), 35 (end) are always in fixed positions
- **Randomization**: Middle questions (2-17, 19-34) are randomly ordered per session
- **Progress Tracking**: Uses Kannada numerals (೧, ೨, ೩...) for mystical UI consistency
- **Validation**: Multilingual support, no English-only restrictions, minimum response requirements

### Authentication & Session Management
- **Primary**: Replit Auth with automatic session persistence
- **Fallback**: Magic link system via nodemailer
- **UI Language**: "Apotropaic realm" terminology instead of technical auth language
- **Session Storage**: PostgreSQL-backed with automatic token refresh

### Mystical UI Design System
- **Typography**: Garamond font family throughout
- **Colors**: Dark forest green background (#0B1F0B), golden accents
- **Symbols**: Tamil/Kannada OM symbols (ௐ, ಓಂ), Devanagari numerals
- **Animation**: Subtle consciousness-themed transitions, blinking golden caret

### Response Sharing System
- **Public Sharing**: Optional shareable links to completed questionnaires
- **URL Structure**: `/shared/:shareId` for public access (no auth required)
- **Privacy Control**: User opt-in during completion flow

### Completion Tracking & Restrictions
- **Timing Enforcement**: 66-day (5,688,000 second) interval between completions
- **Silent Restriction**: Generic error messages without revealing timing details
- **Completion Counter**: Ordinal display (first, second, third time) with philosophical language
- **PDF Generation**: Professional formatted results with custom branding

## Database Schema (Drizzle ORM)

### Core Tables
- `users`: Basic user info, completion counts, Replit Auth integration
- `questionnaire_sessions`: Session state, question ordering, completion status, sharing settings
- `responses`: Individual question answers with timestamps
- `magic_links`: Authentication fallback tokens with expiration

### Key Relationships
- User → Multiple Sessions (one-to-many)
- Session → Multiple Responses (one-to-many)
- Sessions have JSON `questionOrder` field storing randomized question sequence

## Security & Privacy Features

### Data Protection
- **Encryption**: AES-256-GCM for VPS backup storage
- **Rate Limiting**: 100 requests/minute per IP via rate-limiter-flexible
- **Session Security**: Secure PostgreSQL session storage with automatic cleanup
- **Email Privacy**: Configurable SMTP with professional formatting

### Admin System
- **Access Control**: Restricted to specific email addresses in code
- **Dashboard Features**: User/session/response search, database overview
- **API Endpoints**: `/api/admin/*` routes for authenticated admin operations

## Environment Configuration

### Required Variables
```bash
DATABASE_URL=postgresql://...         # Neon PostgreSQL connection
SMTP_HOST=smtp.gmail.com             # Email service configuration
SMTP_USER=formitselfisemptiness@...  # Sender email
SMTP_PASS=app_password               # App password for Gmail
FROM_EMAIL=formitselfisemptiness@... # Reply-to address
VPS_ENDPOINT=https://vps-domain.com  # Secure backup endpoint
VPS_API_KEY=secure-key               # VPS authentication
VPS_ENCRYPTION_KEY=32-char-key       # AES encryption key
```

### Development vs Production
- Development: Vite dev server with HMR, database schema sync
- Production: systemd process management, Apache2 virtual host proxy, SSL/TLS termination

## Deployment Strategy

### VPS Deployment (Production)
- **Domain**: `proust.aformulationoftruth.com`
- **Services**: Main app (port 5000), VPS storage API (port 3001)
- **Process Manager**: systemd
- **Security**: Firewall rules, SSL certificates, secure directories

### Development Environment
- **Frontend**: Vite dev server with React Fast Refresh
- **Backend**: Express with automatic restart on changes
- **Database**: Direct connection to Neon PostgreSQL
- **File Watching**: TypeScript compilation with tsbuildinfo caching

## Special Considerations

### Philosophical Language & Branding
- Maintain mystical terminology throughout UI ("formulation of truth", "apotropaic realm")
- Use scholarly, formal language in completion flows
- Include Tamil/Sanskrit cultural elements respectfully
- PDF quotes reference Lacan and modified Sri Aurobindo with philosophical context

### Multilingual Support
- **Critical**: Never enforce English-only validation
- Support Russian Cyrillic, Arabic, Chinese, and all Unicode scripts
- Validate response length/substance rather than language
- Error messages should be generic and non-discriminatory

### Timing & Flow Control
- **66-Day Restriction**: Enforced silently without revealing specific timing
- **Progressive Experience**: Each completion tracked with ordinal language
- **Email Delivery**: Automatic PDF generation and delivery on completion
- **Backup Integration**: Non-blocking VPS backup for data redundancy

## Testing Strategy

### Frontend Testing
- Jest with jsdom environment for React components
- TanStack Query testing utilities for API integration
- Accessibility testing with Radix UI components

### Backend Testing
- Node.js test environment with Jest
- API endpoint testing with supertest pattern
- Database testing with isolated test environment

### Integration Testing
- End-to-end questionnaire flow validation
- Authentication system testing across providers
- PDF generation and email delivery testing
