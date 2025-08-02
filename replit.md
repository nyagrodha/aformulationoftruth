# A Formulation of Truth Application

## Overview

This is a full-stack web application that implements a digital version of a philosophical questionnaire - a set of questions designed for self-discovery and reflection. The application provides a personalized questionnaire experience with mystical authentication, randomized question ordering, and PDF generation capabilities.

## User Preferences

Preferred communication style: Simple, everyday language. Do not include cultural/prayerful/mindful practices.

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
- **2025-02-01**: Implemented secure VPS storage API with AES-256-GCM encryption for Flokinet VPS hosting
- **2025-02-01**: Added automatic questionnaire backup to VPS upon completion with integrity verification
- **2025-02-01**: Created VPS health monitoring and manual backup endpoints for authenticated users
- **2025-02-01**: Documented complete VPS setup guide with security configuration and API specifications
- **2025-01-31**: Fixed multilingual support - removed English-only validation that rejected non-Latin scripts (Russian Cyrillic, Arabic, Chinese, etc.)
- **2025-01-31**: Implemented silent timing restrictions - 5,688,000 second (66 day) interval enforced server-side without revealing timing information to users
- **2025-01-31**: Updated error messages to be generic without exposing timing details
- **2025-01-31**: Maintained mystical UI language while hiding backend timing logic from users
- **2025-01-31**: Implemented comprehensive admin dashboard with database search functionality
- **2025-01-31**: Added admin authentication middleware restricting access to specified email addresses
- **2025-01-31**: Created admin interface at `/admin` with tabs for Users, Sessions, Responses, and Overview
- **2025-01-31**: Added admin API endpoints: `/api/admin/users`, `/api/admin/sessions`, `/api/admin/responses`, `/api/admin/sessions-with-data`
- **2025-01-31**: Implemented full-text search across users (email, name, ID), sessions (ID, user ID, share ID), and responses (answer text)
- **2025-01-31**: Added admin storage methods for searchUsers, getAllSessions, searchSessions, searchResponses, getSessionsWithResponses
- **2025-01-31**: Updated completion button with Kannada (ಓಂ) and Tamil (ௐ) OM symbols flanking "Finalize & submit"
- **2025-01-31**: Modified PDF quotes: Updated Lacan citation to "Seminar III, 184" and Sri Aurobindo quote to reference "intentional gooning"
- **2025-01-31**: Refined completion flow text with ellipses and philosophical language about "interstitial periods"
- **2025-01-30**: Implemented response sharing system with unique shareable links to public questionnaire views
- **2025-01-30**: Added sharing option checkbox: "Generate a shareable link to my responses" with public access (no registration required)
- **2025-01-30**: Updated completion message: "Each of your responses is saved, securely encrypted in the database @aformulationoftruth.com. You alone can choose with whom to share this work."
- **2025-01-30**: Created public shared questionnaire page at /shared/:shareId with beautiful question/answer display
- **2025-01-30**: Added database fields isShared and shareId to questionnaire_sessions table for sharing functionality
- **2025-01-30**: Implemented completion count tracking system with ordinal display (first, second, third, etc.)
- **2025-01-30**: Updated completion subtitle to show: "You have answered the Proust Questionnaire for the [ordinal] time, offering oneself as a formulation of truth"
- **2025-01-30**: Added completionCount field to users table and increment logic on completion
- **2025-01-30**: Redesigned completion flow with formal, scholarly language replacing mystical terminology
- **2025-01-30**: Updated landing page text with Tamil "அகம்" and refined philosophical phrasing
- **2025-01-30**: Changed completion messages: "Journey" → "Inquiry", "May all paths be auspicious" → "What was sought has been found"
- **2025-01-29**: Updated to Garamond font, dark forest green background, golden blinking caret, and security message on first question only
- **2025-01-29**: Fixed questionnaire completion validation error 
- **2025-01-29**: Updated numerals to Kannada script (೧, ೨, ೩...)
- **2025-01-26**: Removed "fixed question" references from questionnaire display

### Production Deployment
The application will be deployed to a VPS hosted at `proust.aformulationoftruth.com` with Apple Mail SMTP servers configured for email delivery from `formitselfisemptiness@aformulationoftruth.com`, `eachmomenteverydayur@aformulationoftruth.com`, and root user emails.

The application is designed for easy deployment on platforms like Replit, with automatic detection of environment context and appropriate configuration for development vs. production modes.