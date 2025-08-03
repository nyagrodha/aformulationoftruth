// routes/user.js
import express from 'express';
import sqlite3 from 'sqlite3';
import jwt from 'jsonwebtoken';
import { sendMagicLink } from '../utils/email.js';
const router = express.Router();
const db = new sqlite3.Database('./database.sqlite');
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_here';
const MAGIC_LINK_SECRET = process.env.MAGIC_LINK_SECRET || 'your_magic_link_secret_here';
const MAGIC_LINK_EXPIRATION = '15m';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Request an apotropaic (magic) link for login
router.post('/magic-link', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  db.get(`SELECT id FROM users WHERE email = ?`, [email], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });

    const sendLink = () => {
      const token = jwt.sign({ email }, MAGIC_LINK_SECRET, { expiresIn: MAGIC_LINK_EXPIRATION });
      const link = `${BASE_URL}/user/magic-link/verify?token=${token}`;
      sendMagicLink(email, link)
        .then(() => res.json({ success: true }))
        .catch(e => res.status(500).json({ error: e.message }));
    };

    if (row) {
      return sendLink();
    }

    db.run(`INSERT INTO users (email, created_at) VALUES (?, datetime('now'))`, [email], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      sendLink();
    });
  });
});

// Verify magic link token and issue JWT
router.get('/magic-link/verify', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token is required.' });

  jwt.verify(token, MAGIC_LINK_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Invalid or expired token.' });
    const { email } = decoded;
    const authToken = jwt.sign({ email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token: authToken });
  });
});

// Middleware to authenticate JWT
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided.' });
  const token = authHeader.split(' ')[1];
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Invalid token.' });
    req.user = decoded;
    next();
  });
}

// Get current user profile
router.get('/profile', authenticate, (req, res) => {
  res.json({ email: req.user.email });
});

export default router;
