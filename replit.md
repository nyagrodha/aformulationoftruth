# A Formulation of Truth Application

## Overview

This is a full-stack web application that implements a digital version of a philosophical questionnaire - a set of questions designed for self-discovery and reflection. The application provides a personalized questionnaire experience with mystical authentication, randomized question ordering, and PDF generation capabilities.

## User Preferences

Preferred communication style: Simple, everyday language.

### Landing Page Content Versions
- **Current (v3.0)**: "A practice in self-inquiry these questions invite upon respondents a reflective state of awareness. Persons' authentically crafted responses (or a non-response!) betray something of the interior machinations constituting the subject's personhood, its formulation of truth today."
- **Version 2.0**: "A practice in self-inquiry these questions invite a reflective state of awareness. Persons who craft authentic responses stand to expose some of the inner machinations constituting the subject's personhood, its formulation of truth today."

## System Architecture

The application follows a modern full-stack architecture with clear separation between frontend and backend concerns:

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight client-side routing)
- **State Management**: TanStack React Query for server state, React hooks for local state
- **UI Components**: Radix UI primitives with shadcn/ui design system
- **Styling**: Tailwind CSS with CSS variables for theming
- **Build Tool**: Vite for fast development and optimized production builds

### Backend Architecture
- **Runtime**: Node.js with Express.js server
- **Language**: TypeScript with ES modules
- **Database ORM**: Drizzle ORM with PostgreSQL (Neon database)
- **Authentication**: Magic link-based authentication (passwordless)
- **Email Service**: Nodemailer for sending magic links and results
- **PDF Generation**: PDFKit for creating downloadable questionnaire results

## Key Components

### Authentication System
- **Replit Auth Integration**: OAuth-based authentication using Replit as identity provider
- **Session Management**: Secure session storage using PostgreSQL with automatic token refresh
- **Apotropaic Link Terminology**: Uses "apotropaic link" in user interface instead of technical terms
- **Mystical Auth Experience**: Custom portal pages create coherent, strange authentication flow
  - Landing page with interactive "enter the apotropaic realm" button
  - Auth portal with mystical transition animations and consciousness-themed text
  - Post-auth callback page with identity materialization effects
- **User Experience**: Seamless authentication with automatic session persistence

### Questionnaire Engine
- 35 predefined philosophical questions with intelligent ordering
- Fixed position questions (start/middle/end) ensure proper flow
- Random ordering for middle questions provides unique experiences
- Mystical progress tracking with Devanagari/Arabic numerals
- Response validation ensures meaningful answers

### Database Schema
- **Users**: Basic user information (email, creation date)
- **Magic Links**: Secure authentication tokens with expiration
- **Questionnaire Sessions**: User progress tracking with question ordering
- **Responses**: Individual question answers with timestamps

### PDF Generation Service
- Creates formatted PDF documents of completed questionnaires
- Professional layout with proper typography
- Questions ordered by display sequence, not randomized order
- Includes completion date and branding

### Email Service
- Magic link delivery for authentication
- Result delivery upon questionnaire completion
- HTML-formatted emails with professional styling
- Configurable SMTP settings

## Data Flow

1. **Authentication Flow**:
   - User enters email → Magic link generated → Email sent → Token verification → Session creation

2. **Questionnaire Flow**:
   - Session creation → Question order generation → Progressive answering → Response validation → Progress tracking

3. **Completion Flow**:
   - Final answer submission → Session completion → PDF generation → Email delivery → Download availability

## External Dependencies

### Database
- **Neon PostgreSQL**: Serverless PostgreSQL database
- **Connection Pooling**: Efficient database connections
- **Migrations**: Drizzle Kit for schema management

### Email Service
- **SMTP Provider**: Configurable (Gmail by default)
- **Environment Variables**: SMTP_HOST, SMTP_USER, SMTP_PASS for configuration

### UI Libraries
- **Radix UI**: Accessible component primitives
- **Lucide React**: Consistent iconography
- **React Hook Form**: Form state management with validation
- **Zod**: Runtime type validation

### Development Tools
- **Vite**: Fast development server and build tool
- **TypeScript**: Type safety across the stack
- **Tailwind CSS**: Utility-first styling
- **ESBuild**: Fast production bundling

## Deployment Strategy

### Development Environment
- Vite dev server for frontend with HMR
- Express server with automatic restarts
- Database schema synchronization via Drizzle

### Production Build
- Frontend: Vite builds optimized static assets
- Backend: ESBuild bundles server code for Node.js
- Database: Migration-based schema updates
- Environment: Configurable via environment variables

### Environment Configuration
- `DATABASE_URL`: PostgreSQL connection string
- `SMTP_*`: Email service configuration
- `FROM_EMAIL`: Sender email address
- `REPLIT_DOMAINS`: Deployment domain configuration

### Recent Changes: Latest modifications with dates
- **2025-01-29**: Updated Ganapati shloka to traditional Devanagari script
- **2025-01-29**: Fixed questionnaire completion validation error 
- **2025-01-29**: Changed Devanagari numerals to Sanskrit words (एक, द्वि, त्रि...)
- **2025-01-26**: Removed "fixed question" references from questionnaire display
- **2025-01-26**: Implemented procession of shlokas with Ganapati/Ganesh for first question
- **2025-01-26**: Added shloka and deity fields to question interface
- **2025-01-26**: Enhanced question display with shloka invocations in mystical styling

### Production Deployment
The application will be deployed to a VPS hosted at `proust.aformulationoftruth.com` with Apple Mail SMTP servers configured for email delivery from `formitselfisemptiness@aformulationoftruth.com`, `eachmomenteverydayur@aformulationoftruth.com`, and root user emails.

The application is designed for easy deployment on platforms like Replit, with automatic detection of environment context and appropriate configuration for development vs. production modes.