# Keybase Bot Setup Guide

This guide explains how to set up and deploy the Keybase authentication bot for aformulationoftruth.com.

## Prerequisites

1. **Keybase Account**: Create a Keybase account for your bot
2. **Paper Key**: Generate a paper key for the bot account
3. **Team Membership**: Add the bot to the `a4mulasatyasya` Keybase team
4. **PostgreSQL**: Ensure PostgreSQL is running and accessible
5. **Node.js**: Version 18+ recommended

## Setup Steps

### 1. Environment Configuration

Create or update `/home/marcel/aformulationoftruth/backend/.env`:

```bash
# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/aformulationoftruth

# JWT Configuration
JWT_SECRET=your-super-secure-jwt-secret-key-here

# Keybase Bot Configuration
KEYBASE_USERNAME=your_bot_username
KEYBASE_PAPER_KEY=your_keybase_paper_key_here

# Server Configuration
PORT=3000
NODE_ENV=production
```

### 2. Database Schema

The bot automatically creates these tables on startup:

- `keybase_users`: Stores Keybase user information
- `magic_codes`: Temporary storage for authentication codes

### 3. Install Dependencies

```bash
cd backend
npm install
```

### 4. Test the Bot Locally

```bash
npm run dev
```

### 5. Deploy as System Service

```bash
# Copy service file
sudo cp aformulationoftruth-bot.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable auto-start
sudo systemctl enable aformulationoftruth-bot

# Start the service
sudo systemctl start aformulationoftruth-bot

# Check status
sudo systemctl status aformulationoftruth-bot
```

## API Endpoints

### Authentication Endpoints

#### Request Magic Code
```http
POST /api/auth/keybase/request
Content-Type: application/json

{
  "keybase_username": "alice"
}
```

#### Verify Magic Code
```http
POST /api/auth/keybase/verify
Content-Type: application/json

{
  "keybase_username": "alice",
  "magic_code": "123456"
}
```

### Data Endpoints

#### Submit Questionnaire
```http
POST /proust
Content-Type: application/json

{
  "keybase_username": "alice",
  "responses": [
    {
      "question": "What is your idea of perfect happiness?",
      "answer": "A quiet morning with a good book."
    }
  ]
}
```

#### Get User's Questionnaire
```http
GET /api/user/alice/questionnaire
```

#### Trigger PDF Delivery (Internal)
```http
POST /api/internal/send-pdf
Content-Type: application/json

{
  "keybase_username": "alice",
  "pdf_path": "/path/to/questionnaire.pdf"
}
```

## Features

### 1. Magic Code Authentication 🔐

- Users provide their Keybase username on the website
- Bot sends a 6-digit magic code via Keybase DM
- Users enter the code to log in
- Creates JWT session token

### 2. PDF Delivery 📄

- When users complete the Proust Questionnaire, a PDF is automatically generated
- PDF is delivered securely via Keybase's end-to-end encryption
- PDFs are automatically cleaned up after 24 hours

### 3. Questionnaire Swap 🤝

- Users can send `!meetup` to the bot via DM
- Bot randomly pairs eligible users
- Shares each user's questionnaire responses with their partner
- Both users must have completed questionnaires and be logged in

## Bot Commands

Users can interact with the bot via Keybase DM:

- `!meetup` - Request a random questionnaire swap with another user

## Security Features

- All communication uses Keybase's end-to-end encryption
- Magic codes expire after 10 minutes
- Rate limiting on all API endpoints
- PDFs are automatically cleaned up
- No sensitive data logged

## Troubleshooting

### Check Bot Status
```bash
sudo systemctl status aformulationoftruth-bot
sudo journalctl -u aformulationoftruth-bot -f
```

### Common Issues

1. **Bot won't start**: Check environment variables and PostgreSQL connection
2. **PDF generation fails**: Ensure Puppeteer dependencies are installed
3. **Keybase connection issues**: Verify paper key and bot permissions

### Database Queries

Check user data:
```sql
SELECT * FROM keybase_users;
SELECT * FROM magic_codes WHERE expires_at > NOW();
SELECT * FROM responses r JOIN keybase_users ku ON ku.id = r.user_id;
```

## File Structure

```
backend/
├── keybase-bot.js              # Main bot logic
├── utils/pdf-generator.js      # PDF generation utility
├── server.js                   # Express server with endpoints
├── .env                        # Environment variables
└── pdfs/                      # Generated PDFs (auto-cleanup)
```

## Monitoring

The service logs to systemd journal. Monitor with:

```bash
journalctl -u aformulationoftruth-bot -f
```

Key metrics to monitor:
- Bot connection status
- Magic code success rates
- PDF generation success
- Questionnaire swap completions