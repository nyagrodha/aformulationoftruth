# Questionnaire Migration to Gimbal

## Target Server
- **Hostname**: gimbal.fobdongle.com
- **IP Address**: 82.221.100.18

## Components Required for Migration

### 1. Backend Application
Transfer the entire backend directory:
- `/home/marcel/aformulationoftruth/backend/`
  - `dist/` - compiled TypeScript (server.js, routes/, utils/)
  - `node_modules/` - or run `npm install` on gimbal
  - `package.json` & `package-lock.json`
  - `.env` file with updated configuration

### 2. Frontend Files
- `/var/www/aformulationoftruth/frontend/public/questionnaire.html`
- This is the only frontend file needed (self-contained HTML with inline CSS/JS)

### 3. Database Components

#### Tables Required
- `users` (for authentication)
- `questionnaire_sessions` (tracks user sessions)
- `questionnaire_question_order` (Fisher-Yates shuffled questions)
- `user_answers` (stores responses)
- `newsletter_subscribers` (for magic link emails)

#### Migration Scripts
- `/home/marcel/aformulationoftruth/backend/migrations/001_create_newsletter_subscribers.sql`
- `/home/marcel/aformulationoftruth/backend/migrations/002_questionnaire_optimization.sql`
- `/home/marcel/aformulationoftruth/backend/migrations/003_cross_platform_support.sql`

### 4. Environment Configuration (.env updates)

```bash
# Change these values:
BASE_URL=https://gimbal.fobdongle.com
DATABASE_URL=postgresql://a4m_app:password@localhost:5432/a4m_db  # or new DB
PORT=8393  # or different port

# Keep these (sensitive - already configured):
SENDGRID_API_KEY=SG.XXXXXXXXXXXXXXXXXXXXXXX.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
JWT_SECRET=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
SENDGRID_FROM_EMAIL=noreply@aformulationoftruth.com
SENDGRID_FROM_NAME=A Formulation of Truth
TOKEN_EXPIRY_MINUTES=15
EMAIL_SUBJECT=Your Magic Sign-In Link - A Formulation of Truth
```

### 5. SystemD Service (optional, could use PM2 instead)

Adapt `/etc/systemd/system/a4mula.service` for gimbal paths:

```ini
[Unit]
Description=a formulation of truth - questionnaire backend
After=network.target

[Service]
Type=simple
User=marcel
Group=www-data
WorkingDirectory=/path/to/backend
EnvironmentFile=/path/to/backend/.env
ExecStart=/usr/bin/node --enable-source-maps dist/server.js
Restart=always
RestartSec=2
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
```

### 6. Web Server Configuration

Caddy or Nginx configuration needs to:
- Serve `questionnaire.html` from `/questions` route
- Reverse proxy `/api/*` to backend port (8393)
- Proxy `/auth/verify` and `/auth/callback` to backend

Example Caddy config:
```
gimbal.fobdongle.com {
    # Serve questionnaire HTML
    handle /questions {
        root * /var/www/questionnaire
        try_files {path} /questionnaire.html
    }

    # Auth endpoints
    handle /auth/verify {
        reverse_proxy http://localhost:8393
    }

    handle /auth/callback {
        reverse_proxy http://localhost:8393
    }

    # API endpoints
    handle /api/* {
        reverse_proxy http://localhost:8393
    }
}
```

### 7. PostgreSQL Database Setup

```bash
# Install PostgreSQL
sudo apt install postgresql postgresql-contrib

# Create database and user
sudo -u postgres psql
CREATE DATABASE a4m_db;
CREATE USER a4m_app WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE a4m_db TO a4m_app;
\q

# Run migrations
psql -U a4m_app -d a4m_db -f migrations/001_create_newsletter_subscribers.sql
psql -U a4m_app -d a4m_db -f migrations/002_questionnaire_optimization.sql
psql -U a4m_app -d a4m_db -f migrations/003_cross_platform_support.sql
```

## Key Features

### Fisher-Yates Shuffle Implementation
- Located in: `/home/marcel/aformulationoftruth/backend/utils/fisherYates_shuffle.js`
- Used in: `/home/marcel/aformulationoftruth/backend/dist/routes/questions.js`
- Shuffles all 35 Proust questions per session
- Stored in `questionnaire_question_order` table

### Magic Link Authentication
- SendGrid sends magic link to user's email
- Link format: `https://BASE_URL/auth/verify?token=JWT_TOKEN`
- Backend validates token and redirects to: `/questionnaire.html?token=JWT&email=user@example.com`
- Frontend stores token in localStorage and fetches questions

### API Routes Required
- `GET /api/questions/next` - Get next unanswered question (requires auth)
- `POST /api/answers` - Submit answer (requires auth)
- `GET /api/user/me` - Get current user info (requires auth)
- `POST /auth/verify` - Verify magic link token
- `GET /auth/callback` - Handle authentication callback

## Deployment Options

### Option A: Full Stack on Gimbal
- Install everything on gimbal.fobdongle.com
- Run local PostgreSQL database
- Independent from current aformulationoftruth.com infrastructure

### Option B: Shared Database
- Keep using remote database at 10.99.0.1 (via VPN)
- Only move frontend and backend application

### Option C: Replace Keycloak Instance
- If keycloak is hosted on gimbal, remove it
- Use same port/configuration for questionnaire
