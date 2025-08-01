
const express = require('express');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const { RateLimiterMemory } = require('rate-limiter-flexible');
const fs = require('fs').promises;
const path = require('path');
const winston = require('winston');

const app = express();
const PORT = process.env.PORT || 3001;

// Configure logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: '/var/log/secure-storage-error.log', level: 'error' }),
    new winston.transports.File({ filename: '/var/log/secure-storage.log' })
  ]
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Allow API usage
  crossOriginEmbedderPolicy: false
}));

app.use(bodyParser.json({ limit: '10mb' }));

// Trust proxy for rate limiting
app.set('trust proxy', 1);

// Enhanced rate limiting
const rateLimiter = new RateLimiterMemory({
  keyPrefix: 'vps_storage',
  points: 50, // Reduced from 100 for better security
  duration: 60, // per 60 seconds
  blockDuration: 300, // Block for 5 minutes if exceeded
});

// API Key authentication with timing attack protection
const API_KEY = process.env.VPS_API_KEY;
if (!API_KEY || API_KEY.length < 32) {
  logger.error('VPS_API_KEY must be set and at least 32 characters long');
  process.exit(1);
}

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn(`Unauthorized access attempt from ${req.ip}`);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const token = authHeader.substring(7);
  
  // Constant-time comparison to prevent timing attacks
  let isValid = token.length === API_KEY.length;
  for (let i = 0; i < Math.max(token.length, API_KEY.length); i++) {
    isValid = isValid && (token[i] === API_KEY[i]);
  }
  
  if (!isValid) {
    logger.warn(`Invalid API key attempt from ${req.ip}`);
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  logger.info(`Authenticated request from ${req.ip} to ${req.path}`);
  next();
};

// Apply rate limiting to all routes
app.use(async (req, res, next) => {
  try {
    await rateLimiter.consume(req.ip);
    next();
  } catch {
    logger.warn(`Rate limit exceeded for ${req.ip}`);
    res.status(429).json({ error: 'Too many requests' });
  }
});

// Data storage paths with better security
const BASE_SECURE_DIR = process.env.SECURE_DATA_DIR || '/secure';
const RESPONSES_DIR = path.join(BASE_SECURE_DIR, 'responses');
const SESSIONS_DIR = path.join(BASE_SECURE_DIR, 'sessions');

// Ensure directories exist with proper permissions
async function ensureDirs() {
  try {
    await fs.mkdir(BASE_SECURE_DIR, { recursive: true, mode: 0o700 });
    await fs.mkdir(RESPONSES_DIR, { recursive: true, mode: 0o700 });
    await fs.mkdir(SESSIONS_DIR, { recursive: true, mode: 0o700 });
    logger.info('Secure directories initialized');
  } catch (error) {
    logger.error('Failed to create secure directories:', error);
    process.exit(1);
  }
}

// Input validation middleware
const validateInput = (req, res, next) => {
  const { body } = req;
  
  // Sanitize input - remove null bytes and control characters
  const sanitize = (obj) => {
    if (typeof obj === 'string') {
      return obj.replace(/[\x00-\x1f\x7f]/g, '');
    }
    if (typeof obj === 'object' && obj !== null) {
      for (const key in obj) {
        obj[key] = sanitize(obj[key]);
      }
    }
    return obj;
  };
  
  req.body = sanitize(body);
  next();
};

app.use(validateInput);

// Health check endpoint (no auth for monitoring)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Store encrypted response
app.post('/api/responses', authenticate, async (req, res) => {
  try {
    const { sessionId, questionId, encryptedAnswer, createdAt, hash } = req.body;
    
    // Enhanced validation
    if (!sessionId || !questionId || !encryptedAnswer || !hash) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Validate sessionId format (UUID-like)
    if (!/^[a-f0-9-]{36}$/i.test(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID format' });
    }
    
    // Validate questionId is a number
    if (!Number.isInteger(questionId) || questionId < 1 || questionId > 100) {
      return res.status(400).json({ error: 'Invalid question ID' });
    }
    
    const fileName = `${sessionId}-${questionId}-${Date.now()}.json`;
    const filePath = path.join(RESPONSES_DIR, fileName);
    
    const data = {
      sessionId,
      questionId,
      encryptedAnswer,
      createdAt,
      hash,
      storedAt: new Date().toISOString(),
      serverVersion: '1.0.0'
    };
    
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), { mode: 0o600 });
    
    logger.info(`Response stored: ${fileName}`);
    res.json({ success: true, id: fileName });
  } catch (error) {
    logger.error('Storage error:', error);
    res.status(500).json({ error: 'Storage failed' });
  }
});

// Store session data
app.post('/api/sessions', authenticate, async (req, res) => {
  try {
    const sessionData = req.body;
    
    if (!sessionData.id) {
      return res.status(400).json({ error: 'Session ID required' });
    }
    
    const fileName = `${sessionData.id}-${Date.now()}.json`;
    const filePath = path.join(SESSIONS_DIR, fileName);
    
    const data = {
      ...sessionData,
      storedAt: new Date().toISOString(),
      serverVersion: '1.0.0'
    };
    
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), { mode: 0o600 });
    
    logger.info(`Session stored: ${fileName}`);
    res.json({ success: true, id: fileName });
  } catch (error) {
    logger.error('Session storage error:', error);
    res.status(500).json({ error: 'Session storage failed' });
  }
});

// Retrieve responses for a session
app.get('/api/responses/:sessionId', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Validate sessionId
    if (!/^[a-f0-9-]{36}$/i.test(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID format' });
    }
    
    const files = await fs.readdir(RESPONSES_DIR);
    const sessionFiles = files.filter(file => 
      file.startsWith(sessionId) && file.endsWith('.json')
    );
    
    const responses = [];
    for (const file of sessionFiles) {
      const filePath = path.join(RESPONSES_DIR, file);
      const data = await fs.readFile(filePath, 'utf8');
      responses.push(JSON.parse(data));
    }
    
    logger.info(`Retrieved ${responses.length} responses for session ${sessionId}`);
    res.json(responses);
  } catch (error) {
    logger.error('Retrieval error:', error);
    res.status(500).json({ error: 'Retrieval failed' });
  }
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}, shutting down gracefully`);
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
ensureDirs().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`VPS Storage API running on port ${PORT}`);
    console.log(`VPS Storage API running on port ${PORT}`);
  });
}).catch(error => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});
