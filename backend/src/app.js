// backend/src/app.js (ESM)
import express from 'express';
import authRouter from './auth/auth.js';

const app = express();

// trust proxy when behind Apache
app.set('trust proxy', 1);

// Security + body parsing
app.disable('x-powered-by');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount API routers BEFORE any static/catchall
// We mount at BOTH /auth and /api/auth for compatibility with old calls.
app.use('/auth', authRouter);
app.use('/api/auth', authRouter);

// Lightweight health probe
app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'a4mula', env: process.env.NODE_ENV || 'development' });
});

// Debug: list top-level routes/methods (helps confirm mounts)
app.get('/api/__routes', (_req, res) => {
  const out = [];
  for (const layer of app._router?.stack || []) {
    if (layer.route?.path) {
      const methods = Object.keys(layer.route.methods || {})
        .filter((m) => layer.route.methods[m])
        .map((m) => m.toUpperCase())
        .sort();
      out.push({ path: layer.route.path, methods });
    }
  }
  res.json(out);
});

export default app;
