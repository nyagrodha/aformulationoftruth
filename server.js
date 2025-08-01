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
