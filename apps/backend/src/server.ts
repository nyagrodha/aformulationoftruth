import express from 'express';
import cors from 'cors';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { db } from './db.js';
import authRoutes from './routes/auth.js';

// Extend the SessionData interface to include userId
declare module 'express-session' {
  interface SessionData {
    userId: string;
  }
}

const app = express();

// --- Middleware ---
// Correct CORS configuration
app.use(cors({
  origin: 'https://aformulationoftruth.com', // Allow requests from your frontend
  credentials: true // Allow cookies to be sent
}));

app.use(express.json());

// Correct Session Configuration
const PgSession = connectPgSimple(session);
app.use(session({
  store: new PgSession({
    pool: db.$client as any, // Corrected to $client
    tableName: 'user_sessions',
  }),
  secret: 'your-super-secret-key-change-this-please', // Change this!
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true, // Required for cross-site cookies
    sameSite: 'none', // Required for cross-site cookies
    maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
  }
}));

// --- Routes ---
app.use('/api/auth', authRoutes);
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// --- Server Start ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
