const path = require('path');
const express = require('express');
const dotenv = require('dotenv');
const { getPool } = require('./postgres');

// Load environment variables from .env if present
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

// Serve static assets from public directory so the frontend and backend can be
// hosted from a single process during development.
app.use(express.static(path.join(__dirname, '..', 'public')));

// Simple request logging to aid with debugging API calls.
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

function withDatabase(handler) {
  return async (req, res) => {
    let pool;

    try {
      pool = getPool();
    } catch (error) {
      console.error('Database connection is not configured:', error.message);
      res.status(503).json({ error: 'Database connection is not configured.' });
      return;
    }

    try {
      await handler(pool, req, res);
    } catch (error) {
      console.error('Unexpected error while handling database-backed request:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'An unexpected error occurred.' });
      }
    }
  };
}

// Health check endpoint verifies we can connect to PostgreSQL
app.get('/api/health', withDatabase(async (pool, _req, res) => {
  try {
    const result = await pool.query('SELECT NOW() AS now');
    res.json({ status: 'ok', databaseTime: result.rows[0].now });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
}));

// Persist questionnaire responses
app.post('/api/responses', withDatabase(async (pool, req, res) => {
  const { email, answers } = req.body || {};

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }

  if (typeof answers !== 'object' || answers === null) {
    return res.status(400).json({ error: 'Answers must be provided as an object.' });
  }

  try {
    const insert = `
      INSERT INTO questionnaire_responses (email, answers)
      VALUES ($1, $2)
      RETURNING id, email, created_at
    `;

    const { rows } = await pool.query(insert, [email.toLowerCase(), answers]);

    res.status(201).json({
      message: 'Responses stored successfully',
      response: rows[0]
    });
  } catch (error) {
    console.error('Failed to store questionnaire responses:', error);
    res.status(500).json({ error: 'Failed to save responses' });
  }
}));

// Basic listing endpoint intended for administrative verification.
app.get('/api/responses', withDatabase(async (pool, _req, res) => {
  try {
    const query = `
      SELECT id, email, answers, created_at
      FROM questionnaire_responses
      ORDER BY created_at DESC
      LIMIT 100
    `;
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (error) {
    console.error('Failed to read questionnaire responses:', error);
    res.status(500).json({ error: 'Failed to read responses' });
  }
}));

// Fallback so that direct navigation to routes still serve the SPA assets.
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);

  try {
    getPool();
  } catch (error) {
    console.warn('PostgreSQL connection not yet configured:', error.message);
  }
});
