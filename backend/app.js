// backend/src/app.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import contactRouter from './routes/contact.js';

import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';   // ⬅️ PG session store
import cors from 'cors';

import ensureQuestionOrder from './middleware/questionOrder.js';
import questionsRouter from './routes/questions.js';
import authRouter from './routes/auth.js';
import pool from './db/pool.js';                   // ⬅️ your existing pg Pool

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const rawQuestions = require('../data/questions.json');


const PgSession = connectPgSimple(session);
app.use(session({
  name: 'a4mula.sid',
  secret: [process.env.SESSION_SECRET].filter(Boolean),
  resave: false,
  saveUnitialized: false,
  store: new PgSession({
    pool,
    tableName: 'session',
    createTableIfMissing: true,
    pruneSessionInterval: 60 * 60 * 1000
  }),
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV == 'production',
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));
    
const app = express();

/* Core */
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json());

if (process.env.CORS_ORIGIN) {
  app.use(cors({ origin: process.env.CORS_ORIGIN, credentials: true }));
}

/* Questions cache */
const questionList = (Array.isArray(rawQuestions) ? rawQuestions : (rawQuestions?.questions || []))
  .map(q => ({ ...q, id: Number(q.id) }))
  .sort((a, b) => a.id - b.id);
app.set('questions', questionList);

/* Sessions (PostgreSQL) */
const isProd = process.env.NODE_ENV === 'production';
const secretRotation = [process.env.SESSION_SECRET, process.env.OLD_SESSION_SECRET].filter(Boolean);
const sessionSecret = secretRotation.length
  ? secretRotation
  : (isProd
      ? (() => { throw new Error('SESSION_SECRET is required in production'); })()
      : (process.env.DEV_SESSION_SECRET || 'dev-only-not-secret'));

app.use(session({
  name: 'a4mula.sid',
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  store: new PgSession({
    pool,                         // reuse your Pool
    tableName: 'session',         // or whatever name you prefer
    // Optional conveniences:
    createTableIfMissing: true,   // auto-create if your version supports it
    pruneSessionInterval: 60 * 60 * 1000, // prune expired every hour
  }),
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,               // true in prod (HTTPS)
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    path: '/',
  },
}));

/* Routes */
app.use(ensureQuestionOrder);
app.use('/api/questions', questionsRouter);
app.use('/api/auth', authRouter);
app.use('/api/contact', contactRouter);

/* Static (if Express serves the SPA; otherwise let Nginx do it) */
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const publicDir = process.env.STATIC_ROOT || path.join(__dirname, '../../frontend/build');
app.use(express.static(publicDir));
app.get('*', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));

export default app;
