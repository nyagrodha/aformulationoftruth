// backend/src/server.js
import express from 'express';
import cookieParser from 'cookie-parser';

// Import the PostgreSQL connection pool
import { pool } from './db.js';

// Import your routers
import authRouter from './auth/auth.js';
import questionsRouter from './routes/questions.js';

const app = express();

/* -------------------- Core App Setup -------------------- */
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Make the database pool available to request handlers if needed
app.locals.pool = pool;

/* -------------------- API Routes -------------------- */
// Mount the authentication router
app.use('/api/auth', authRouter);

// Mount the new questions router.
// Authentication is handled inside the router itself.
app.use('/api/questions', questionsRouter);

/* -------------------- Health Check -------------------- */
app.get('/api/health', async (_req, res) => {
  let db = false;
  try {
    await pool.query('SELECT 1');
    db = true;
  } catch {
    db = false;
  }
  res.json({ ok: true, db, time: new Date().toISOString() });
});

/* -------------------- Start Server -------------------- */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
});

export default app;
