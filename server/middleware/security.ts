import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { createClient, RedisClientType } from 'redis';
import cors from 'cors';
import helmet from 'helmet';
import type { Express } from 'express';

// Redis client for rate limiting (shared across limiters)
let redisClient: RedisClientType | null = null;
let redisConnected = false;

async function getRedisClient(): Promise<RedisClientType | null> {
  if (!process.env.REDIS_URL) {
    console.warn('REDIS_URL not set, rate limiting will use in-memory store');
    return null;
  }

  if (redisClient && redisConnected) {
    return redisClient;
  }

  try {
    redisClient = createClient({ url: process.env.REDIS_URL });

    redisClient.on('error', (err) => {
      console.error('Redis error:', err);
      redisConnected = false;
    });

    redisClient.on('connect', () => {
      console.log('Redis connected for rate limiting');
      redisConnected = true;
    });

    await redisClient.connect();
    return redisClient;
  } catch (err) {
    console.error('Failed to connect to Redis:', err);
    return null;
  }
}

// Create rate limiter with optional Redis store
function createRateLimiter(options: {
  windowMs: number;
  max: number;
  message: string;
  prefix: string;
}) {
  const baseConfig = {
    windowMs: options.windowMs,
    max: options.max,
    message: { error: options.message },
    standardHeaders: true,
    legacyHeaders: false,
  };

  // Return limiter factory that will be configured with Redis when available
  return rateLimit(baseConfig);
}

// Rate limiting configuration (will be updated with Redis store)
let limiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  prefix: 'rl:general:',
});

// Stricter rate limiting for authentication endpoints
let authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many authentication attempts, please try again later.',
  prefix: 'rl:auth:',
});

// CORS configuration
const corsOptions: cors.CorsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, postman)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5000', 
      'https://aformulationoftruth.com',
      'https://proust.aformulationoftruth.com',
      /\.aformulationoftruth\.com$/
    ];
    
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (typeof allowedOrigin === 'string') {
        return origin === allowedOrigin;
      }
      return allowedOrigin.test(origin);
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
};

// Helmet configuration for security headers
// Note: 'unsafe-inline' for styles is kept due to multiple pages with inline styles
// TODO: Extract inline styles from remaining pages (about, contact, index, app, etc.)
// to fully remove 'unsafe-inline' from styleSrc
const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],  // Fonts now self-hosted
      fontSrc: ["'self'"],  // Fonts now self-hosted, no Google Fonts
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:", "i.imgur.com"],  // Allow imgur for maintenance page
      connectSrc: ["'self'", "api.open-meteo.com"],  // Weather API for snow effect
      frameSrc: ["'self'", "www.youtube-nocookie.com", "w.soundcloud.com"],  // Embeds on maintenance/rich pages
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      mediaSrc: ["'self'"],  // Allow self-hosted audio
    },
  },
  crossOriginEmbedderPolicy: false, // Allow embedding for shared questionnaires
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
});

export async function setupSecurity(app: Express) {
  // Trust proxy for accurate IP detection (must be set before rate limiting)
  app.set('trust proxy', 1);

  // Apply security headers
  app.use(helmetConfig);

  // Apply CORS
  app.use(cors(corsOptions));

  // Initialize Redis-backed rate limiting
  const client = await getRedisClient();

  if (client) {
    // Create Redis-backed rate limiters
    limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      message: { error: 'Too many requests from this IP, please try again later.' },
      standardHeaders: true,
      legacyHeaders: false,
      store: new RedisStore({
        sendCommand: (...args: string[]) => client.sendCommand(args),
        prefix: 'rl:general:',
      }),
    });

    authLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 5,
      message: { error: 'Too many authentication attempts, please try again later.' },
      standardHeaders: true,
      legacyHeaders: false,
      store: new RedisStore({
        sendCommand: (...args: string[]) => client.sendCommand(args),
        prefix: 'rl:auth:',
      }),
    });

    console.log('Rate limiting using Redis store');
  } else {
    console.warn('Rate limiting using in-memory store (not suitable for production with multiple instances)');
  }

  // Apply general rate limiting to all requests
  app.use(limiter);

  // Apply stricter rate limiting to auth endpoints
  app.use('/api/auth/magic-link', authLimiter);
  app.use('/api/auth/magic-link/verify', authLimiter);
  app.use('/api/auth/logout', authLimiter);
}

// Graceful shutdown for Redis connection
export async function shutdownRateLimiter(): Promise<void> {
  if (redisClient && redisConnected) {
    try {
      await redisClient.quit();
      console.log('Redis connection closed');
    } catch (err) {
      console.error('Error closing Redis connection:', err);
    }
  }
}

// Health check middleware
export function healthCheck(app: Express) {
  app.get('/healthz', (req, res) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0'
    });
  });
  
  app.get('/metrics', (req, res) => {
    res.status(200).json({
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      platform: process.platform,
      version: process.version,
      env: process.env.NODE_ENV || 'development'
    });
  });
}
