// server.js
// ─── Rate-limit middleware ───────────────────────────────────────────────
import express from 'express';
const app = express();
import rateLimit from 'express-rate-limit';          // ESM import
import answersRouter from './routes/answers.js';   // note the “.js” extension

import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import path from 'path';
import questionsRouter from './routes/questions.js';
app.use('/api/questions', questionsRouter);
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
app.use(express.static(path.join(__dirname, 'public')));


// Register route handler for retrieving basic user information via /api/user

//Route for homepage
app.get('/', (req, res) => {
  res.send('Hello worlds from /');
});

// Initialize PostgreSQL database
import { Client } from 'pg';

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

client.connect()
  .then(() => {
    console.log('Connected to PostgreSQL database');
    
    // Create tables if they don't exist
    return client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE,
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

// Submit Proust responses
app.post('/proust', (req, res) => {
  const { email, responses } = req.body;

  client.query('SELECT id FROM users WHERE email = $1', [email])
    .then(result => {
      if (result.rows.length === 0) {
        return res.status(400).json({ error: 'User not found' });
      }

      const userId = result.rows[0].id;
      const insertPromises = responses.map(({ question, answer }) => 
        client.query('INSERT INTO responses (user_id, question, answer) VALUES ($1, $2, $3)', [userId, question, answer])
      );

      return Promise.all(insertPromises);
    })
    .then(() => {
      res.json({ message: 'Responses saved' });
    })
    .catch(err => {
      console.error('Database error:', err);
      res.status(500).json({ error: 'Error saving responses' });
    });
});

//added to prevent crash
console.log('🧪 Reached end of server.js setup');
// Start server
setInterval(() => {}, 1000 * 60); // keep-alive

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
});