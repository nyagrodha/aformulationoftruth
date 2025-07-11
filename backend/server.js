// server.js
// ─── Rate-limit middleware ───────────────────────────────────────────────
import rateLimit from 'express-rate-limit';          // ESM import
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

/*
// Example of per-route limiting
app.post(
  '/auth/login',
  rateLimit({ windowMs: 60_000, max: 5, message: 'Slow down…' }),
  loginController
);
*/
// ──────────────────────────────────────────────────────────────────────────
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'your-secret-key'; // Replace this with a secure value

// Middleware
app.use(cors());
app.use(express.json());
//Serve static files from "public"
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/answers', require('./routes/answers'));

// register route handler for submitting and retrieving user answers via /api/answers
app.use('/api/answers', require('./routes/answers'));

// Register route handler for retrieving the list of Proust questions via /api/questions
app.use('/api/questions', require('./routes/questions'));

// Register route handler for retrieving basic user information via /api/user
app.use('/api/user', require('./routes/user'));

//Route for homepage
app.get('/', (req, res) => {
  res.send('Hello worlds from /');
});

// Initialize SQLite database
const db = new sqlite3.Database('./database.sqlite', (err) => {
  if (err) {
    console.error('Failed to open database:', err.message);
  } else {
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      token TEXT
    );`);

    db.run(`CREATE TABLE IF NOT EXISTS responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      question TEXT,
      answer TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );`);
  }
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

  db.run('INSERT OR IGNORE INTO users (email, token) VALUES (?, ?)', [email, token], (err) => {
    if (err) {
      return res.status(500).json({ error: 'Database error' });
    }

    transporter.sendMail({
      to: email,
      subject: 'Your Magic Login Link',
      text: `Click here to log in: ${link}`
    }, (error, info) => {
      if (error) {
        return res.status(500).json({ error: 'Email error' });
      }
      res.json({ message: 'Magic link sent' });
    });
  });
});

// Verify token
app.get('/auth/verify', (req, res) => {
  const { token } = req.query;

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    db.get('SELECT * FROM users WHERE email = ?', [decoded.email], (err, user) => {
      if (err || !user) {
        return res.status(400).json({ error: 'Invalid user' });
      }
      res.json({ message: 'Logged in', user });
    });
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

// Submit Proust responses
app.post('/proust', (req, res) => {
  const { email, responses } = req.body;

  db.get('SELECT id FROM users WHERE email = ?', [email], (err, user) => {
    if (err || !user) {
      return res.status(400).json({ error: 'User not found' });
    }

    const stmt = db.prepare('INSERT INTO responses (user_id, question, answer) VALUES (?, ?, ?)');
    for (const { question, answer } of responses) {
      stmt.run(user.id, question, answer);
    }

    stmt.finalize((err) => {
      if (err) {
        return res.status(500).json({ error: 'Error saving responses' });
      }
      res.json({ message: 'Responses saved' });
    });
  });
});

//added to prevent crash
console.log('🧪 Reached end of server.js setup');
// Start server
setInterval(() => {}, 1000 * 60); // keep-alive

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
});
