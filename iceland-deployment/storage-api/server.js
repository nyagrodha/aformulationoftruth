/**
 * Gimbal Encrypted Storage API Server
 * Secure storage endpoint for proust questionnaire responses
 *
 * Features:
 * - AES-256-GCM encryption for all stored data
 * - HMAC-SHA256 integrity verification
 * - Bearer token authentication
 * - Rate limiting
 * - Security headers (Helmet)
 * - CORS protection
 */

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const EncryptionService = require('./encryption');
const db = require('./db');

// Configuration
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';
const API_KEY = process.env.API_KEY;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Validate required environment variables
if (!API_KEY) {
  console.error('ERROR: API_KEY environment variable is required');
  process.exit(1);
}

if (!ENCRYPTION_KEY) {
  console.error('ERROR: ENCRYPTION_KEY environment variable is required');
  process.exit(1);
}

// Initialize encryption service
const encryption = new EncryptionService(ENCRYPTION_KEY);

// Create Express app
const app = express();

// Security middleware
app.use(helmet({
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  frameguard: { action: 'deny' }
}));

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);

    // Allow proust domain and localhost
    const allowedOrigins = [
      'https://proust.aformulationoftruth.com',
      'https://aformulationoftruth.com',
      'http://localhost:3000',
      'http://localhost:5000'
    ];

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression
app.use(compression());

// Logging
if (NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// Strict rate limiting for write operations
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: 'Too many write requests, please try again later.'
});

/**
 * Authentication middleware
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.substring(7);

  if (token !== API_KEY) {
    return res.status(403).json({ error: 'Invalid API key' });
  }

  next();
}

/**
 * Error handler middleware
 */
function errorHandler(err, req, res, next) {
  console.error('Error:', err);

  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS policy violation' });
  }

  res.status(500).json({
    error: 'Internal server error',
    message: NODE_ENV === 'development' ? err.message : 'An error occurred'
  });
}

// ============================================================================
// Routes
// ============================================================================

/**
 * Health check (public)
 */
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    await db.pool.query('SELECT 1');

    res.json({
      status: 'healthy',
      timestamp: Date.now(),
      service: 'gimbal-storage-api',
      version: '1.0.0'
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: 'Database connection failed'
    });
  }
});

/**
 * Store encrypted response
 * POST /api/responses
 */
app.post('/api/responses', authenticate, writeLimiter, async (req, res) => {
  try {
    const { sessionId, questionId, answer, timestamp } = req.body;

    // Validate input
    if (!sessionId || !questionId || !answer || !timestamp) {
      return res.status(400).json({
        error: 'Missing required fields: sessionId, questionId, answer, timestamp'
      });
    }

    // Encrypt response
    const encryptedResponse = encryption.encryptResponse({
      sessionId,
      questionId,
      answer,
      timestamp
    });

    // Store in database
    const result = await db.storeResponse(encryptedResponse);

    res.status(201).json({
      success: true,
      id: result.id,
      message: 'Response stored successfully'
    });

  } catch (error) {
    console.error('Error storing response:', error);
    res.status(500).json({
      error: 'Failed to store response',
      message: NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Store session metadata
 * POST /api/sessions
 */
app.post('/api/sessions', authenticate, writeLimiter, async (req, res) => {
  try {
    const { sessionId, completed, questionOrder, isShared, shareId } = req.body;

    // Validate input
    if (!sessionId) {
      return res.status(400).json({
        error: 'Missing required field: sessionId'
      });
    }

    // Store session
    const result = await db.storeSession({
      sessionId,
      completed: completed || false,
      questionOrder: questionOrder || [],
      isShared: isShared || false,
      shareId: shareId || null
    });

    res.status(201).json({
      success: true,
      id: result.id,
      message: 'Session stored successfully'
    });

  } catch (error) {
    console.error('Error storing session:', error);
    res.status(500).json({
      error: 'Failed to store session',
      message: NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get encrypted responses for a session
 * GET /api/responses/:sessionId
 */
app.get('/api/responses/:sessionId', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { decrypt } = req.query;

    // Get responses from database
    const responses = await db.getResponses(sessionId);

    if (responses.length === 0) {
      return res.status(404).json({
        error: 'No responses found for this session'
      });
    }

    // Optionally decrypt responses
    if (decrypt === 'true') {
      try {
        const decryptedResponses = responses.map(r => encryption.decryptResponse(r));
        res.json({
          sessionId,
          count: decryptedResponses.length,
          responses: decryptedResponses
        });
      } catch (error) {
        return res.status(500).json({
          error: 'Failed to decrypt responses',
          message: error.message
        });
      }
    } else {
      // Return encrypted responses
      res.json({
        sessionId,
        count: responses.length,
        responses
      });
    }

  } catch (error) {
    console.error('Error retrieving responses:', error);
    res.status(500).json({
      error: 'Failed to retrieve responses',
      message: NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get session metadata
 * GET /api/sessions/:sessionId
 */
app.get('/api/sessions/:sessionId', authenticate, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = await db.getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        error: 'Session not found'
      });
    }

    res.json(session);

  } catch (error) {
    console.error('Error retrieving session:', error);
    res.status(500).json({
      error: 'Failed to retrieve session',
      message: NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Get database statistics (authenticated)
 * GET /api/stats
 */
app.get('/api/stats', authenticate, async (req, res) => {
  try {
    const stats = await db.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Error retrieving stats:', error);
    res.status(500).json({
      error: 'Failed to retrieve statistics'
    });
  }
});

/**
 * 404 handler
 */
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path
  });
});

// Error handler
app.use(errorHandler);

// ============================================================================
// Start Server
// ============================================================================

async function startServer() {
  try {
    // Initialize database schema
    console.log('Initializing database...');
    await db.initializeSchema();

    // Start server
    app.listen(PORT, HOST, () => {
      console.log('');
      console.log('═══════════════════════════════════════════════════════');
      console.log(`  Gimbal Encrypted Storage API`);
      console.log('═══════════════════════════════════════════════════════');
      console.log(`  Environment: ${NODE_ENV}`);
      console.log(`  Server:      http://${HOST}:${PORT}`);
      console.log(`  Health:      http://${HOST}:${PORT}/health`);
      console.log('───────────────────────────────────────────────────────');
      console.log(`  Encryption:  AES-256-GCM`);
      console.log(`  Integrity:   HMAC-SHA256`);
      console.log(`  Auth:        Bearer Token`);
      console.log('═══════════════════════════════════════════════════════');
      console.log('');
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  db.pool.end(() => {
    console.log('Database connections closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  db.pool.end(() => {
    console.log('Database connections closed');
    process.exit(0);
  });
});

// Start the server
startServer();
