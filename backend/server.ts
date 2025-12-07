// server.js
// Load environment variables
import dotenv from 'dotenv';
dotenv.config(); // Load from .env in current directory

// ─── Rate-limit middleware ───────────────────────────────────────────────
import express from 'express';
const app = express();
import rateLimit from 'express-rate-limit';          // ESM import
import answersRouter, { setDatabaseClient } from './routes/answers.js';   // note the ".js" extension

import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import path from 'path';
import crypto from 'crypto';
import questionsRouter, { setDatabaseClient as setQuestionsDatabaseClient } from './routes/questions.js';
import authRouter from './routes/auth.js';
// import KeybaseAuthBot from './keybase-bot.js';
import PDFGenerator from './utils/pdf-generator.js';
import { verifyToken, optionalAuth } from './middleware/auth.js';
import KaruppasāmiBot from './bots/karuppasami-telegram.js';

// Protected API routes requiring authentication
app.use('/api/questions', verifyToken, questionsRouter);
// make __dirname available by default
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// const rateLimit = require('express-rate-limit');  // CommonJS



// Global limiter: 100 requests per IP per 15 min
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,        // 15 minutes
  max: 100,                        // limit each IP
  standardHeaders: true,           // adds 'RateLimit-*' headers
  legacyHeaders: false,            // removes 'X-RateLimit-*'
  message: { error: 'Too many subscription attempts. Kindly desist :)' },
});

// Apply to all API routes
app.use('/api', apiLimiter);
// routes
app.get('/api/ping', (_, res) => res.json({ pong: true }));
/*
// Example of per-route limiting
app.post(
  '/auth/login',
  rateLimit({ windowMs: 60_000, max: 5, message: 'Slow down…' }),
  loginController
);
*/
// ──────────────────────────────────────────────────────────────────────────
const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
if (!process.env.JWT_SECRET) {
  console.warn('⚠️  WARNING: JWT_SECRET not set in environment variables. Using fallback (not secure for production).');
}

// Middleware
app.set('trust proxy', 1); // Trust first proxy (Caddy)
app.use(cors());
app.use(express.json());

// Mount API routes that need JSON parsing
app.use('/api/answers', answersRouter);

//Serve static files from "public" (HTML/CSS files)
app.use(express.static(path.join(__dirname, "../frontend/public")));


// Register route handler for retrieving basic user information via /api/user

// Homepage is served automatically by static middleware (index.html)

// Initialize PostgreSQL database
import { Client } from 'pg';
import { setDatabaseClient as setDbUtilsClient } from './utils/db.js';

// Parse DATABASE_URL or use individual env vars
const getDatabaseConfig = () => {
  if (process.env.DATABASE_URL) {
    // Parse postgresql://user:password@host:port/database
    const url = new URL(process.env.DATABASE_URL);
    return {
      host: url.hostname,
      port: parseInt(url.port) || 5432,
      database: url.pathname.slice(1), // remove leading /
      user: url.username,
      password: decodeURIComponent(url.password)
    };
  }
  // Fallback to individual env vars (deprecated)
  return {
    host: process.env.DB_HOST || '10.99.0.1',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'a4m_db',
    user: process.env.DB_USER || 'a4m_app',
    password: process.env.DB_PASSWORD || 'jsT@sA2nd1nsd3cl2y0'
  };
};

const client = new Client(getDatabaseConfig());

client.connect()
  .then(() => {
    console.log('Connected to PostgreSQL database');

    // Pass the database client to routes that need it
    setDatabaseClient(client);
    setAuthDatabaseClient(client);
    setDbUtilsClient(client);
    setPhoneDatabaseClient(client);
    setProfileDatabaseClient(client);
    setQuestionsDatabaseClient(client);
    setUserDatabaseClient(client);

    // Create users table if it doesn't exist
    return client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        public_key TEXT NOT NULL,
        email TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP,
        token TEXT,
        ip_address TEXT,
        is_admin BOOLEAN DEFAULT FALSE
      );
    `);
  })
  .then(() => {
    // Create responses table
    return client.query(`
      CREATE TABLE IF NOT EXISTS responses (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        question TEXT,
        answer TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );
    `);
  })
  .then(() => {
    // Create magic_link_tokens table
    return client.query(`
      CREATE TABLE IF NOT EXISTS magic_link_tokens (
        token TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  })
  .then(() => {
    // Add auth_method column to users table if it doesn't exist
    return client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS auth_method TEXT DEFAULT 'password';
    `);
  })
  .then(() => {
    // Create questionnaire_sessions table
    return client.query(`
      CREATE TABLE IF NOT EXISTS questionnaire_sessions (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        session_hash TEXT UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed BOOLEAN DEFAULT FALSE,
        completed_at TIMESTAMP
      );
    `);
  })
  .then(() => {
    // Add completed_at column to questionnaire_sessions if it doesn't exist
    return client.query(`
      ALTER TABLE questionnaire_sessions
      ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
    `);
  })
  .then(() => {
    // Create questionnaire_question_order table for shuffled questions
    return client.query(`
      CREATE TABLE IF NOT EXISTS questionnaire_question_order (
        id SERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        question_position INTEGER NOT NULL,
        question_id INTEGER NOT NULL,
        question_text TEXT NOT NULL,
        answered BOOLEAN DEFAULT FALSE,
        presented_at TIMESTAMP,
        answered_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(session_id, question_position)
      );
    `);
  })
  .then(() => {
    // Create index for questionnaire_question_order
    return client.query(`
      CREATE INDEX IF NOT EXISTS idx_questionnaire_question_order_session
      ON questionnaire_question_order(session_id);
    `);
  })
  .then(() => {
    return client.query(`
      CREATE INDEX IF NOT EXISTS idx_questionnaire_question_order_answered
      ON questionnaire_question_order(session_id, answered, question_position);
    `);
  })
  .then(() => {
    // Add display_name column to users table if it doesn't exist
    return client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS display_name TEXT;
    `);
  })
  .then(() => {
    // Create user_answers table for questionnaire responses
    return client.query(`
      CREATE TABLE IF NOT EXISTS user_answers (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        question_index INTEGER NOT NULL,
        question_id INTEGER NOT NULL,
        answer_text TEXT NOT NULL,
        session_id INTEGER,
        answer_sequence INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  })
  .then(() => {
    // Add session_id column to user_answers if it doesn't exist
    return client.query(`
      ALTER TABLE user_answers
      ADD COLUMN IF NOT EXISTS session_id INTEGER;
    `);
  })
  .then(() => {
    // Add answer_sequence column to user_answers if it doesn't exist
    return client.query(`
      ALTER TABLE user_answers
      ADD COLUMN IF NOT EXISTS answer_sequence INTEGER;
    `);
  })
  .then(() => {
    // Create indexes for better performance
    return client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);
  })
  .then(() => {
    return client.query(`
      CREATE INDEX IF NOT EXISTS idx_responses_user_id ON responses(user_id);
    `);
  })
  .then(() => {
    return client.query(`
      CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_expires_at ON magic_link_tokens(expires_at);
    `);
  })
  .then(() => {
    return client.query(`
      CREATE INDEX IF NOT EXISTS idx_questionnaire_sessions_email ON questionnaire_sessions(email);
    `);
  })
  .then(() => {
    return client.query(`
      CREATE INDEX IF NOT EXISTS idx_questionnaire_sessions_hash ON questionnaire_sessions(session_hash);
    `);
  })
  .then(() => {
    return client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_answers_user_id ON user_answers(user_id);
    `);
  })
  .then(() => {
    // Create ip_geolocation table for enhanced IP tracking
    return client.query(`
      CREATE TABLE IF NOT EXISTS ip_geolocation (
        id SERIAL PRIMARY KEY,
        ip_address TEXT UNIQUE NOT NULL,
        city TEXT,
        region TEXT,
        country TEXT,
        country_code TEXT,
        location TEXT,
        postal_code TEXT,
        timezone TEXT,
        org TEXT,
        asn TEXT,
        hostname TEXT,
        is_vpn BOOLEAN DEFAULT FALSE,
        is_proxy BOOLEAN DEFAULT FALSE,
        is_tor BOOLEAN DEFAULT FALSE,
        is_hosting BOOLEAN DEFAULT FALSE,
        is_relay BOOLEAN DEFAULT FALSE,
        first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        lookup_count INTEGER DEFAULT 1,
        raw_response JSONB
      );
    `);
  })
  .then(() => {
    // Create user_ip_history table
    return client.query(`
      CREATE TABLE IF NOT EXISTS user_ip_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        ip_id INTEGER REFERENCES ip_geolocation(id) ON DELETE SET NULL,
        accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        user_agent TEXT,
        action TEXT
      );
    `);
  })
  .then(() => {
    // Add current_ip_id to users table
    return client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS current_ip_id INTEGER REFERENCES ip_geolocation(id);
    `);
  })
  .then(() => {
    // Create indexes for ip_geolocation
    return client.query(`
      CREATE INDEX IF NOT EXISTS idx_ip_geolocation_ip_address ON ip_geolocation(ip_address);
    `);
  })
  .then(() => {
    return client.query(`
      CREATE INDEX IF NOT EXISTS idx_ip_geolocation_country ON ip_geolocation(country);
    `);
  })
  .then(() => {
    return client.query(`
      CREATE INDEX IF NOT EXISTS idx_ip_geolocation_is_vpn ON ip_geolocation(is_vpn);
    `);
  })
  .then(() => {
    return client.query(`
      CREATE INDEX IF NOT EXISTS idx_ip_geolocation_is_tor ON ip_geolocation(is_tor);
    `);
  })
  .then(() => {
    return client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_ip_history_user_id ON user_ip_history(user_id);
    `);
  })
  .then(() => {
    return client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_ip_history_ip_id ON user_ip_history(ip_id);
    `);
  })
  .then(() => {
    return client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_ip_history_accessed_at ON user_ip_history(accessed_at);
    `);
  })
  .then(() => {
    console.log('✓ Database tables and indexes created successfully');
  })
  .catch(err => {
    console.error('Database connection error:', err);
  });

// Initialize Keybase bot and PDF generator
// const keybaseBot = new KeybaseAuthBot();
const pdfGenerator = new PDFGenerator();

// keybaseBot.initialize().catch(err => {
//   console.error('Keybase bot initialization error:', err);
// });

// Cleanup old PDFs every hour
setInterval(() => {
  pdfGenerator.cleanupOldPDFs();
}, 60 * 60 * 1000);


// email transport (replace with real credentials)
//const transporter = nodemailer.createTransport({
//  host: 'smtp.example.com',
//  port: 587,
//  secure: false,
//  auth: {
//    user: 'you@example.com',
//    pass: 'yourpassword'//
//  }
//});

// Import setDatabaseClient from auth router
import { setDatabaseClient as setAuthDatabaseClient } from './routes/auth.js';

// Import phone verification and profile routes
import phoneVerificationRouter from './routes/phone-verification.js';
import profileRouter from './routes/profile.js';
import userRouter from './routes/user.js';
import { setDatabaseClient as setPhoneDatabaseClient } from './routes/phone-verification.js';
import { setDatabaseClient as setProfileDatabaseClient } from './routes/profile.js';
import { setDatabaseClient as setUserDatabaseClient } from './routes/user.js';

// Mount auth routes
app.use('/auth', authRouter);

// Mount phone verification and profile routes
app.use('/api/phone', phoneVerificationRouter);
app.use('/api/profile', profileRouter);
app.use('/api/user', userRouter);

// Geolocation endpoint to detect user's country
import { getCachedIPInfo } from './utils/ip-lookup.js';
app.get('/api/geolocation', async (req, res) => {
  try {
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const ipInfo = await getCachedIPInfo(ipAddress);

    res.json({
      country: ipInfo?.country || 'Unknown',
      isUSA: ipInfo?.country === 'US'
    });
  } catch (error) {
    console.error('Error getting geolocation:', error);
    res.json({ country: 'Unknown', isUSA: false });
  }
});

// Clean up expired tokens periodically
import { cleanupExpiredTokens } from './utils/db.js';
setInterval(() => {
  cleanupExpiredTokens();
}, 5 * 60 * 1000); // Run every 5 minutes

// Keybase Auth Endpoints - DISABLED
// Request magic code via Keybase
/*
app.post('/api/auth/keybase/request', async (req, res) => {
  const { keybase_username } = req.body;

  if (!keybase_username) {
    return res.status(400).json({ error: 'Keybase username is required' });
  }

  try {
    const result = await keybaseBot.sendMagicCode(keybase_username);
    if (result.success) {
      res.json({ message: 'Magic code sent via Keybase DM' });
    } else {
      res.status(500).json({ error: result.error || 'Failed to send magic code' });
    }
  } catch (error) {
    console.error('Error requesting Keybase auth:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify Keybase magic code
app.post('/api/auth/keybase/verify', async (req, res) => {
  const { keybase_username, magic_code } = req.body;

  if (!keybase_username || !magic_code) {
    return res.status(400).json({ error: 'Keybase username and magic code are required' });
  }

  try {
    const result = await keybaseBot.verifyMagicCode(keybase_username, magic_code);

    if (result.valid) {
      // Generate JWT token for the session
      const token = jwt.sign({ keybase_username }, JWT_SECRET, { expiresIn: '24h' });
      res.json({
        message: result.message,
        token,
        user: { keybase_username }
      });
    } else {
      res.status(401).json({ error: result.message });
    }
  } catch (error) {
    console.error('Error verifying Keybase auth:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
*/

// Submit Proust responses (handles both email and Keybase users)
app.post('/proust', async (req, res) => {
  const { email, keybase_username, responses } = req.body;

  if (!responses || responses.length === 0) {
    return res.status(400).json({ error: 'Responses are required' });
  }

  try {
    let userId = null;
    let userType = null;

    // Determine user type and get/create user ID
    if (keybase_username) {
      // Keybase user
      const keybaseResult = await client.query('SELECT id FROM keybase_users WHERE keybase_username = $1', [keybase_username]);

      if (keybaseResult.rows.length === 0) {
        return res.status(400).json({ error: 'Keybase user not found. Please log in first.' });
      }

      userId = keybaseResult.rows[0].id;
      userType = 'keybase';

    } else if (email) {
      // Email user
      const emailResult = await client.query('SELECT id FROM users WHERE email = $1', [email]);

      if (emailResult.rows.length === 0) {
        return res.status(400).json({ error: 'User not found' });
      }

      userId = emailResult.rows[0].id;
      userType = 'email';

    } else {
      return res.status(400).json({ error: 'Either email or keybase_username is required' });
    }

    // Save responses to database
    const insertPromises = responses.map(({ question, answer }) =>
      client.query('INSERT INTO responses (user_id, question, answer) VALUES ($1, $2, $3)', [userId, question, answer])
    );

    await Promise.all(insertPromises);

    // Generate and deliver PDF for Keybase users - DISABLED
    /* if (userType === 'keybase') {
      try {
        const pdfResult = await pdfGenerator.generateProustQuestionnairePDF(responses, keybase_username);

        if (pdfResult.success) {
          // Send PDF via Keybase bot
          const deliveryResult = await keybaseBot.sendProustPDF(keybase_username, pdfResult.filepath);

          if (deliveryResult.success) {
            res.json({
              message: 'Responses saved and PDF delivered via Keybase',
              delivery: 'keybase'
            });
          } else {
            res.json({
              message: 'Responses saved but PDF delivery failed',
              delivery: 'failed',
              error: deliveryResult.error
            });
          }
        } else {
          res.json({
            message: 'Responses saved but PDF generation failed',
            delivery: 'failed',
            error: pdfResult.error
          });
        }
      } catch (pdfError) {
        console.error('PDF processing error:', pdfError);
        res.json({
          message: 'Responses saved but PDF processing failed',
          delivery: 'failed',
          error: pdfError.message
        });
      }
    } else { */
      // Email user - responses saved only
      res.json({ message: 'Responses saved', delivery: 'none' });
    // }

  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ error: 'Error saving responses' });
  }
});

// Bot Integration Endpoints - DISABLED
/*
// Internal endpoint for triggering PDF delivery
app.post('/api/internal/send-pdf', async (req, res) => {
  const { keybase_username, pdf_path } = req.body;

  if (!keybase_username || !pdf_path) {
    return res.status(400).json({ error: 'keybase_username and pdf_path are required' });
  }

  try {
    const result = await keybaseBot.sendProustPDF(keybase_username, pdf_path);
    if (result.success) {
      res.json({ message: 'PDF sent successfully' });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('Error sending PDF:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get eligible users for swap
app.get('/api/users/eligible-for-swap', async (req, res) => {
  try {
    const result = await client.query(`
      SELECT keybase_username FROM keybase_users
      WHERE is_eligible_for_swap = true
      ORDER BY last_login DESC
    `);

    res.json({
      users: result.rows.map(row => row.keybase_username)
    });
  } catch (error) {
    console.error('Error fetching eligible users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user questionnaire
app.get('/api/user/:username/questionnaire', async (req, res) => {
  const { username } = req.params;

  try {
    const result = await client.query(`
      SELECT r.question, r.answer, r.id
      FROM responses r
      JOIN keybase_users ku ON ku.id = r.user_id
      WHERE ku.keybase_username = $1
      ORDER BY r.id
    `, [username]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Questionnaire not found for user' });
    }

    res.json({
      username,
      responses: result.rows,
      total_questions: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching questionnaire:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user questionnaire PDF
app.get('/api/user/:username/questionnaire.pdf', async (req, res) => {
  const { username } = req.params;

  try {
    // This would serve the generated PDF file
    // For now, return a message
    res.json({
      message: `PDF endpoint for ${username} - to be implemented`
    });
  } catch (error) {
    console.error('Error fetching PDF:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
*/

// Helper function to generate hashed username from email
function generateHashedUsername(email) {
  const hash = crypto.createHmac('sha256', JWT_SECRET)
    .update(email.toLowerCase().trim())
    .digest('hex');
  return hash.substring(0, 16);
}

// Email validation function
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Start questionnaire - collect email and create session
app.post('/api/questionnaire/start', async (req, res) => {
  const { email } = req.body;

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Valid email address is required' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const sessionHash = generateHashedUsername(normalizedEmail);
  const username = `user_${sessionHash}`;

  try {
    // Check if session already exists
    let sessionResult = await client.query(
      'SELECT id, completed FROM questionnaire_sessions WHERE email = $1',
      [normalizedEmail]
    );

    if (sessionResult.rows.length === 0) {
      // Create new session
      await client.query(
        'INSERT INTO questionnaire_sessions (email, session_hash, completed) VALUES ($1, $2, $3)',
        [normalizedEmail, sessionHash, false]
      );
    }

    // Find or create user
    let userResult = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [normalizedEmail]
    );

    let userId;
    if (userResult.rows.length === 0) {
      // Create new user with hashed username
      const insertResult = await client.query(
        'INSERT INTO users (email, username, display_name) VALUES ($1, $2, $3) RETURNING id',
        [normalizedEmail, username, username]
      );
      userId = insertResult.rows[0].id;
      console.log(`Created new user with ID: ${userId}, username: ${username}`);
    } else {
      userId = userResult.rows[0].id;
    }

    res.json({
      success: true,
      message: 'Email registered successfully',
      sessionHash,
      email: normalizedEmail
    });

  } catch (error) {
    console.error('Error starting questionnaire:', error);
    res.status(500).json({
      error: 'Failed to start questionnaire',
      details: error.message
    });
  }
});

// Save questionnaire responses (simplified endpoint for new frontend)
app.post('/api/responses', async (req, res) => {
  const { email, answers } = req.body;

  if (!email || !answers) {
    return res.status(400).json({ error: 'Email and answers are required' });
  }

  try {
    // Get or create user
    let userResult = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    let userId;

    if (userResult.rows.length === 0) {
      // Create new user with just email and username
      const insertResult = await client.query(
        'INSERT INTO users (email, username) VALUES ($1, $2) RETURNING id',
        [email, email.split('@')[0]]
      );
      userId = insertResult.rows[0].id;
    } else {
      userId = userResult.rows[0].id;
    }

    // Save responses to user_answers table - answers is an object with question indices as keys
    const savePromises = Object.entries(answers).map(([questionIndex, answer]) => {
      const idx = parseInt(questionIndex);
      return client.query(
        'INSERT INTO user_answers (user_id, question_index, question_id, answer_text) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET answer_text = $4, updated_at = CURRENT_TIMESTAMP',
        [userId, idx, idx + 1, answer]
      );
    });

    await Promise.all(savePromises);

    res.json({
      success: true,
      message: 'Responses saved successfully',
      userId
    });
  } catch (error) {
    console.error('Error saving responses:', error);
    res.status(500).json({ error: 'Failed to save responses', details: error.message });
  }
});


// Specific routes - Allow access with optional JWT authentication
app.get('/questions', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/questionnaire.html'));
});

app.get('/questionnaire', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/questionnaire.html'));
});

// Public routes
app.get('/about', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/about.html'));
});

// Catch-all handler: send back main page for any non-API routes
app.get(/^(?!\/api)/, (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

//added to prevent crash
console.log('🧪 Reached end of server.js setup');

// Initialize Telegram Bot
if (process.env.TELEGRAM_BOT_TOKEN) {
  try {
    const karuppasāmiBot = new KaruppasāmiBot(process.env.TELEGRAM_BOT_TOKEN, client);
    console.log('👹 கருப்பசாமி கேள்வித்தாள் (Karuppacāmi kēḷvittāḷ) bot initialized');
  } catch (error) {
    console.error('❌ Failed to initialize Telegram bot:', error);
  }
} else {
  console.warn('⚠️  TELEGRAM_BOT_TOKEN not set - bot will not start');
}

// Start server
setInterval(() => {}, 1000 * 60); // keep-alive

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
});