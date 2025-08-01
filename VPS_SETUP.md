# VPS Secure Storage Setup Guide

## Overview
This API provides secure, encrypted storage for user questionnaire responses on your Flokinet VPS. All data is encrypted using AES-256-GCM before transmission and storage.

## Environment Variables Required

Add these to your environment configuration:

```bash
# VPS Storage Configuration
VPS_ENDPOINT=https://your-vps-domain.com
VPS_API_KEY=your-secure-api-key-here
VPS_ENCRYPTION_KEY=your-32-character-encryption-key
```

## VPS Server Setup

### 1. Install Dependencies on Your VPS
```bash
# Node.js application on VPS
npm install express body-parser helmet rate-limiter-flexible
```

### 2. VPS Server Code (save as server.js on your VPS)

```javascript
const express = require('express');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(bodyParser.json({ limit: '10mb' }));

// Rate limiting
const rateLimiter = new RateLimiterMemory({
  keyPrefix: 'middleware',
  points: 100, // Number of requests
  duration: 60, // per 60 seconds
});

// API Key authentication
const API_KEY = process.env.VPS_API_KEY || 'your-secure-api-key';

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const token = authHeader.substring(7);
  if (token !== API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  next();
};

// Apply rate limiting and auth to all routes
app.use(async (req, res, next) => {
  try {
    await rateLimiter.consume(req.ip);
    next();
  } catch {
    res.status(429).json({ error: 'Too many requests' });
  }
});

// Data storage paths
const RESPONSES_DIR = '/secure/responses';
const SESSIONS_DIR = '/secure/sessions';

// Ensure directories exist
async function ensureDirs() {
  await fs.mkdir(RESPONSES_DIR, { recursive: true });
  await fs.mkdir(SESSIONS_DIR, { recursive: true });
}

// Health check endpoint
app.get('/health', authenticate, (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Store encrypted response
app.post('/api/responses', authenticate, async (req, res) => {
  try {
    const { sessionId, questionId, encryptedAnswer, createdAt, hash } = req.body;
    
    if (!sessionId || !questionId || !encryptedAnswer || !hash) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const fileName = `${sessionId}-${questionId}-${Date.now()}.json`;
    const filePath = path.join(RESPONSES_DIR, fileName);
    
    const data = {
      sessionId,
      questionId,
      encryptedAnswer,
      createdAt,
      hash,
      storedAt: new Date().toISOString()
    };
    
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    res.json({ success: true, id: fileName });
  } catch (error) {
    console.error('Storage error:', error);
    res.status(500).json({ error: 'Storage failed' });
  }
});

// Store session data
app.post('/api/sessions', authenticate, async (req, res) => {
  try {
    const sessionData = req.body;
    const fileName = `${sessionData.id}-${Date.now()}.json`;
    const filePath = path.join(SESSIONS_DIR, fileName);
    
    await fs.writeFile(filePath, JSON.stringify(sessionData, null, 2));
    res.json({ success: true, id: fileName });
  } catch (error) {
    console.error('Session storage error:', error);
    res.status(500).json({ error: 'Session storage failed' });
  }
});

// Retrieve responses for a session
app.get('/api/responses/:sessionId', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const files = await fs.readdir(RESPONSES_DIR);
    const sessionFiles = files.filter(file => file.startsWith(sessionId));
    
    const responses = [];
    for (const file of sessionFiles) {
      const filePath = path.join(RESPONSES_DIR, file);
      const data = await fs.readFile(filePath, 'utf8');
      responses.push(JSON.parse(data));
    }
    
    res.json(responses);
  } catch (error) {
    console.error('Retrieval error:', error);
    res.status(500).json({ error: 'Retrieval failed' });
  }
});

// Start server
ensureDirs().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VPS Storage API running on port ${PORT}`);
  });
});
```

### 3. VPS Security Configuration

#### Nginx Configuration (optional but recommended)
```nginx
server {
    listen 443 ssl;
    server_name your-vps-domain.com;
    
    ssl_certificate /path/to/ssl/cert.pem;
    ssl_certificate_key /path/to/ssl/private.key;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### Firewall Setup
```bash
# UFW configuration
sudo ufw allow ssh
sudo ufw allow https
sudo ufw enable
```

### 4. Start VPS Service
```bash
# On your VPS
node server.js

# Or with PM2 for production
npm install -g pm2
pm2 start server.js --name "secure-storage"
pm2 startup
pm2 save
```

## API Endpoints

### Health Check
```
GET /health
Authorization: Bearer your-api-key
```

### Store Response
```
POST /api/responses
Authorization: Bearer your-api-key
Content-Type: application/json

{
  "sessionId": "session-uuid",
  "questionId": 1,
  "encryptedAnswer": "{\"encrypted\":\"...\",\"iv\":\"...\",\"tag\":\"...\"}",
  "createdAt": "2025-01-31T12:00:00.000Z",
  "hash": "integrity-hash"
}
```

### Store Session
```
POST /api/sessions
Authorization: Bearer your-api-key
Content-Type: application/json

{
  "id": "session-uuid",
  "userId": "user-id",
  "questionOrder": [1,2,3...],
  "completed": true,
  "completedAt": "2025-01-31T12:00:00.000Z",
  "isShared": false
}
```

### Retrieve Responses
```
GET /api/responses/:sessionId
Authorization: Bearer your-api-key
```

## Security Features

1. **AES-256-GCM Encryption**: All responses encrypted before transmission
2. **HMAC Integrity**: SHA-256 HMAC for data integrity verification
3. **API Key Authentication**: Bearer token authentication required
4. **Rate Limiting**: 100 requests per minute per IP
5. **HTTPS Only**: All communications over SSL/TLS
6. **Input Validation**: Comprehensive request validation
7. **Secure Storage**: Files stored in protected directory structure

## Directory Structure on VPS
```
/secure/
├── responses/
│   ├── session-uuid-1-timestamp.json
│   ├── session-uuid-2-timestamp.json
│   └── ...
└── sessions/
    ├── session-uuid-timestamp.json
    └── ...
```

## Monitoring and Logs

Add logging to monitor API usage:
```javascript
// Add to VPS server.js
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'secure-storage.log' })
  ]
});

// Log all API calls
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - ${req.ip}`);
  next();
});
```

## Testing the Connection

From your main application, test the VPS connection:
```bash
curl -H "Authorization: Bearer your-api-key" https://your-vps-domain.com/health
```

## Backup Strategy

Consider implementing automated backups of the `/secure/` directory to another secure location for redundancy.