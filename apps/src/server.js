// backend/server.js
import 'dotenv/config';                  // loads .env
import assert from 'node:assert';
import http from 'node:http';
import express from 'express';

function validateEnv() {
  const required = ['SESSION_SECRET', 'DATABASE_URL'];
  const missing = required.filter((k) => !process.env[k] || String(process.env[k]).trim() === '');
  if (missing.length) {
    console.error('[env] Missing required env var(s):', missing.join(', '));
    process.exitCode = 1;
    return setTimeout(() => process.exit(1), 50);
  }
}

validateEnv();

const app = express();
// --- shim auth + questionnaire routes to unblock the UI ---
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
app.use(express.json());
app.use(cookieParser());
app.post('/api/auth/start', (req, res) => {
  const email = (req.body && req.body.email || '').trim();
  if (!email) return res.status(400).json({ error: 'email required' });

  const sid = crypto.randomUUID();
  SESS.set(sid, { email, createdAt: Date.now() });

  // Send a cookie so the browser is "logged in"
  res.cookie('sid', sid, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,      // keep true behind HTTPS
    path: '/',
    maxAge: 7 * 24 * 3600 * 1000,
  });

  // 202 Accepted mimics “email sent”; adjust as you like
  res.status(202).json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const sid = req.cookies && req.cookies.sid;
  const user = sid && SESS.get(sid);
  res.json({ user: user || null });
});

// Minimal questionnaire stubs
const QUESTIONS = [
  { id: 1, text: 'What is your idea of perfect happiness?' },
  { id: 2, text: 'What is your greatest fear?' },
  { id: 3, text: 'Which living person do you most admire?' },
  { id: 4, text: 'What is your current state of mind?' },
  { id: 5, text: 'What do you most value in your friends?' },
];

app.get('/api/questions', (req, res) => res.json({ questions: QUESTIONS }));

app.post('/api/questions/answer', (req, res) => {
  // accept {id, answer}; you can persist later
  // console.log('answer', req.body);
  res.json({ ok: true });
});
// --- end shim ---
// Use your secret in session/jwt/etc.
const SESSION_SECRET = process.env.SESSION_SECRET;

app.get('/health', (_req, res) => res.status(200).json({ ok: true }));

const PORT = Number(process.env.PORT || 5000);
const server = http.createServer(app);

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[a4m] backend listening on :${PORT}`);
});
