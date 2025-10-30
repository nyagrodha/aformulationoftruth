# A Formulation of Truth

A full-stack web application implementing a philosophical questionnaire based on the Proust Questionnaire. This application provides a personalized questionnaire experience with secure authentication, randomized question ordering, and PDF generation capabilities.

## Project Structure

```
aformulationoftruth/
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── lib/           # Utility functions and services
│   │   └── pages/         # Page components
│   └── index.html         # HTML entry point
│
├── server/                 # Backend Express application
│   ├── services/          # Business logic services
│   │   ├── emailService.ts      # Email/mail server functionality
│   │   ├── pdfService.ts        # PDF generation
│   │   ├── questionService.ts   # Question management
│   │   ├── reminderService.ts   # Reminder scheduling
│   │   └── vpsStorageService.ts # VPS backup functionality
│   ├── middleware/        # Express middleware
│   ├── utils/             # Utility functions
│   ├── auth.ts            # Authentication logic
│   ├── db.ts              # Database connection
│   ├── storage.ts         # Database operations layer
│   ├── routes.ts          # API route definitions
│   ├── index.ts           # Server entry point
│   └── vite.ts            # Vite integration
│
├── shared/                # Shared code between client and server
│   └── schema.ts          # Database schema and types
│
├── tests/                 # Test suites
│   ├── e2e/              # End-to-end tests (Playwright)
│   └── unit/             # Unit tests (Jest)
│
├── maintenance/          # Maintenance scripts
│
└── .config/              # Configuration files

```

## Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight client-side routing)
- **State Management**: TanStack React Query for server state
- **UI Components**: Radix UI primitives with custom styling
- **Styling**: Tailwind CSS with CSS variables for theming
- **Build Tool**: Vite for fast development and optimized production builds

### Backend
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **Database**: PostgreSQL via Drizzle ORM
- **Authentication**: Magic link-based authentication (passwordless)
- **Session Management**: express-session with PostgreSQL store

### Services

#### Database Service (`server/db.ts` & `server/storage.ts`)
- PostgreSQL connection pooling
- Drizzle ORM for type-safe database operations
- User, session, and response management

#### Mail Service (`server/services/emailService.ts`)
- Nodemailer for SMTP email delivery
- Magic link authentication emails
- Questionnaire completion notifications with PDF attachments

#### Other Services
- **PDF Service**: Generates formatted questionnaire results
- **Question Service**: Manages question ordering and validation
- **Reminder Service**: Scheduled reminder emails for recurring questionnaires
- **VPS Storage Service**: Secure backup to remote VPS

## Database Schema

### Tables
- **users**: User profiles with email and completion tracking
- **sessions**: Express session storage
- **magic_links**: Authentication tokens with expiration
- **questionnaire_sessions**: User questionnaire progress
- **responses**: Individual question answers

## Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL 16+
- SMTP credentials for email delivery

### Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your database and SMTP credentials

# Run database migrations
npm run db:push

# Start development server
npm run dev
```

### Environment Variables

Required environment variables:

```env
DATABASE_URL=postgresql://user:password@host:port/database
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-smtp-password
FROM_EMAIL=noreply@example.com
PORT=5000
```

## Development

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm test` - Run unit tests
- `npm run test:e2e` - Run end-to-end tests
- `npm run lint` - Lint code
- `npm run type-check` - TypeScript type checking
- `npm run db:generate` - Generate database migrations
- `npm run db:push` - Push schema changes to database
- `npm run db:studio` - Open Drizzle Studio database GUI

### Testing

The project includes comprehensive test coverage:

- **Unit Tests**: Jest for testing individual functions and services
- **E2E Tests**: Playwright for testing user flows
- **Type Safety**: TypeScript for compile-time type checking

## Deployment

The application is designed for VPS deployment:

1. Build the application: `npm run build`
2. Set environment variables on the server
3. Start with PM2: `pm2 start ecosystem.config.js`

### Production Configuration

The application uses PM2 for process management. See `ecosystem.config.js` for configuration.

## Features

### Authentication
- Magic link-based passwordless authentication
- Secure session management with PostgreSQL
- Automatic session persistence

### Questionnaire Engine
- 35 philosophical questions
- Intelligent question ordering (fixed and randomized)
- Progress tracking and resume capability
- Response validation
- Mystical progress indicators

### PDF Generation
- Professional formatting
- Ordered by question sequence
- Includes completion date and branding

### Email Notifications
- Magic link delivery for authentication
- Completion emails with PDF attachments
- Optional reminder system for recurring completions

### Data Management
- Secure PostgreSQL storage
- Optional VPS backup
- Share completed questionnaires via unique links
- Completion count tracking

## Security Features

- Helmet.js for HTTP security headers
- Rate limiting on API endpoints
- CORS configuration
- Express session security
- SQL injection prevention via Drizzle ORM
- XSS protection

## License

ISC

## Repository

https://github.com/nyagrodha/aformulationoftruth
