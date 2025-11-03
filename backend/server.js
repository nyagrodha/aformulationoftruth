// server.js
// All imports at the top
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import rateLimit from 'express-rate-limit';
import answersRouter from './routes/answers.js';
import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import questionsRouter from './routes/questions.js';
import newsletterRouter from './routes/newsletter.js';
import KeybaseAuthBot from './keybase-bot.js';
import PDFGenerator from './utils/pdf-generator.js';
import { Client } from 'pg';

// Setup __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const envPath = path.join(__dirname, '../.env.local');
dotenv.config({ path: envPath });

// Initialize Express app
const app = express();

app.use('/api/questions', questionsRouter);
app.use('/api/newsletter', newsletterRouter);

// const rateLimit = require('express-rate-limit');  // CommonJS



// Global limiter: 100 requests per IP per 15 min
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,        // 15 minutes
  max: 100,                        // limit each IP
  standardHeaders: true,           // adds 'RateLimit-*' headers
  legacyHeaders: false,            // removes 'X-RateLimit-*'
  message: { error: 'Too many requests; try again later.' },
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
const PORT = process.env.PORT || 3000;

const JWT_SECRET = 'your-secret-key'; // Replace this with a secure value

// Middleware
app.use(cors());
app.use(express.json());
//Serve static files from "public"
app.use(express.static(path.join(__dirname, "../frontend/dist")));


// Register route handler for retrieving basic user information via /api/user

//Route for homepage
app.get('/', (req, res) => {
  res.send('Hello worlds from /');
});

// Initialize PostgreSQL database
const client = new Client({
  connectionString: process.env.DATABASE_URL
});

client.connect()
  .then(() => {
    console.log('Connected to PostgreSQL database');

    // Make database client available to routes
    app.locals.dbClient = client;
    
    // Create tables if they don't exist
    return client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        public_key TEXT NOT NULL,
        email TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP,
        token TEXT
      );
    `);
  })
  .then(() => {
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
  .catch(err => {
    console.error('Database connection error:', err);
  });

// Initialize Keybase bot and PDF generator
const keybaseBot = new KeybaseAuthBot();
const pdfGenerator = new PDFGenerator();

keybaseBot.initialize().catch(err => {
  console.error('Keybase bot initialization error:', err);
});

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

// Generate JWT token
function generateToken(email) {
  return jwt.sign({ email }, JWT_SECRET, { expiresIn: '15m' });
}

// Request magic link
app.post('/auth/request', (req, res) => {
  const { email } = req.body;
  const token = generateToken(email);
  const link = `http://localhost:${PORT}/auth/verify?token=${token}`;

  client.query('INSERT INTO users (email, token) VALUES ($1, $2) ON CONFLICT (email) DO UPDATE SET token = $2', [email, token])
    .then(() => {
      console.log(`🔗 Magic login link for ${email}: ${link}`);
      res.json({ message: 'Magic link (simulated)', link });
    })
    .catch(err => {
      console.error('Database error:', err);
      res.status(500).json({ error: 'Database error' });
    });
});

// Verify token
app.get('/auth/verify', (req, res) => {
  const { token } = req.query;

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    client.query('SELECT * FROM users WHERE email = $1', [decoded.email])
      .then(result => {
        if (result.rows.length === 0) {
          return res.status(400).json({ error: 'Invalid user' });
        }
        res.json({ message: 'Logged in', user: result.rows[0] });
      })
      .catch(err => {
        console.error('Database error:', err);
        res.status(400).json({ error: 'Invalid user' });
      });
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

// Keybase Auth Endpoints
// Request magic code via Keybase
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

    // Generate and deliver PDF for Keybase users
    if (userType === 'keybase') {
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
    } else {
      // Email user - responses saved only
      res.json({ message: 'Responses saved', delivery: 'none' });
    }

  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ error: 'Error saving responses' });
  }
});

// Bot Integration Endpoints

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

// Save questionnaire responses (simplified endpoint)
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
      // Create new user
      const insertResult = await client.query(
        'INSERT INTO users (email, username, password_hash, public_key) VALUES ($1, $2, $3, $4) RETURNING id',
        [email, email.split('@')[0], '', '']
      );
      userId = insertResult.rows[0].id;
    } else {
      userId = userResult.rows[0].id;
    }

    // Save responses - answers is an object with question indices as keys
    const savePromises = Object.entries(answers).map(([questionIndex, answer]) =>
      client.query(
        'INSERT INTO responses (user_id, question, answer) VALUES ($1, $2, $3)',
        [userId, `Question ${parseInt(questionIndex) + 1}`, answer]
      )
    );

    await Promise.all(savePromises);

    res.json({
      success: true,
      message: 'Responses saved successfully',
      userId
    });
  } catch (error) {
    console.error('Error saving responses:', error);
    res.status(500).json({ error: 'Failed to save responses' });
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


// Catch-all handler: send back React app for any non-API routes
app.get(/^(?!\/api)/, (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

//added to prevent crash
console.log('🧪 Reached end of server.js setup');
// Start server
setInterval(() => {}, 1000 * 60); // keep-alive

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
});