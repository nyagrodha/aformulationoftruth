import { Router } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { assertDeliverableEmail } from '../lib/emailValidation.js';
import { makeMagicToken, hashToken, buildVerifyUrl, sendMagicLink } from '../lib/authMail.js';

console.log('[auth] using node-postgres pool');

/* -------------------- Env & constants -------------------- */
const {
  JWT_PRIVATE_KEY,
  JWT_PUBLIC_KEY,
  PUBLIC_ORIGIN = 'https://aformulationoftruth.com',
  COOKIE_NAME = 'a4m_sesh',
  COOKIE_DOMAIN,
  COOKIE_SECURE = '1',
  COOKIE_SAMESITE = 'Lax',
  POST_VERIFY_PATH = '/questionnaire',
  MAGIC_LINK_TTL_MIN: TTLSTR = '15',
} = process.env;

if (!JWT_PRIVATE_KEY || !JWT_PUBLIC_KEY) {
  throw new Error('JWT_PRIVATE_KEY or JWT_PUBLIC_KEY missing from environment');
}
const MAGIC_LINK_TTL_MIN = Number(TTLSTR);

// Zod schema to validate incoming request body for the /start route
const StartSchema = z.object({
  email: z.string().min(1).max(320),
  timezone: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

/* -------------------- Helpers -------------------- */
const router = Router();
const logErr = (where, e) => {
  console.error(`[auth:${where}] ${new Date().toISOString()}\n${e?.stack || e}`);
};
const nowPlusMinutes = (m) => new Date(Date.now() + m * 60 * 1000);
const b64uToBuf = (b64u) => Buffer.from(b64u, 'base64url');

const setSessionCookie = (res, payload) => {
  const token = jwt.sign(payload, JWT_PRIVATE_KEY, {
    expiresIn: '30d',
    algorithm: 'RS256',
  });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: COOKIE_SECURE === '1',
    sameSite: COOKIE_SAMESITE,
    domain: COOKIE_DOMAIN || undefined,
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
};

/* ==========================================================
   POST /start → validate email, store token, email link
   ========================================================== */
router.post('/start', async (req, res) => {
  try {
    const { email: raw, timezone, latitude, longitude } = StartSchema.parse(req.body || {});
    
    // Perform all validation, including the async MX record check
    const email = await assertDeliverableEmail(raw);

    const token = makeMagicToken();
    const tokenHash = hashToken(token);
    const tokenHashBuf = b64uToBuf(tokenHash);
    const expiresAt = nowPlusMinutes(MAGIC_LINK_TTL_MIN);

    // Insert or update the user, now including location data
    await pool.query(
      `INSERT INTO users (email, timezone, latitude, longitude)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET
         timezone = COALESCE(EXCLUDED.timezone, users.timezone),
         latitude = COALESCE(EXCLUDED.latitude, users.latitude),
         longitude = COALESCE(EXCLUDED.longitude, users.longitude)`,
      [email, timezone, latitude, longitude]
    );

    await pool.query(
      `INSERT INTO magic_tokens (email, token_hash, expires_at, purpose)
       VALUES ($1, $2, $3, 'login')`,
      [email, tokenHashBuf, expiresAt]
    );

    const verifyUrl = buildVerifyUrl(token, email);
    await sendMagicLink({ to: email, verifyUrl, timezone });

    return res.json({ ok: true, sent: true });
  } catch (e) {
    logErr('start', e);
    const msg = e?.message || 'unknown_error';
    const status = msg.startsWith('email_') ? 400 : 500;
    return res.status(status).json({ ok: false, error: msg });
  }
});

/* ==========================================================
   GET /verify → consume token, set session cookie, redirect
   ========================================================== */
router.get('/verify', async (req, res) => {
  const client = await pool.connect();
  try {
    const { token } = req.query;
    if (!token || typeof token !== 'string') {
      return res.redirect(`${PUBLIC_ORIGIN}/login?err=link`);
    }

    const tokenHash = hashToken(token);
    const tokenHashBuf = b64uToBuf(tokenHash);
    
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT id, email FROM magic_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() FOR UPDATE`,
      [tokenHashBuf]
    );
    const mt = rows[0];
    if (!mt) {
      await client.query('ROLLBACK');
      return res.redirect(303, '/login?err=link');
    }

    const { rows: urows } = await client.query(
      `SELECT id FROM users WHERE email = $1`, [mt.email]
    );
    const user = urows[0];
    if (!user) {
      // This case is unlikely if /start worked, but is a good safeguard.
      await client.query('ROLLBACK');
      return res.redirect(303, '/login?err=user');
    }

    await client.query(
      `UPDATE magic_tokens SET used_at = now(), user_id = $2 WHERE id = $1`,
      [mt.id, user.id]
    );

    setSessionCookie(res, { sub: user.id });
    
    await client.query('COMMIT');
    return res.redirect(303, POST_VERIFY_PATH);
  } catch (e) {
    await client.query('ROLLBACK');
    logErr('verify', e);
    return res.redirect(303, '/login?err=server');
  } finally {
    client.release();
  }
});

/* ==========================================================
   GET /me → quick auth check for frontend guard
   ========================================================== */
router.get('/me', async (req, res) => {
  try {
    const raw = req.cookies?.[COOKIE_NAME];
    if (!raw) return res.status(401).json({ ok: false });

    const decoded = jwt.verify(raw, JWT_PUBLIC_KEY, { algorithms: ['RS256'] });

    const { rows } = await pool.query('SELECT id, email FROM users WHERE id = $1', [decoded.sub]);
    const user = rows[0];

    if (!user) {
      return res.status(401).json({ ok: false, error: 'user_not_found' });
    }
    return res.json({ ok: true, user });
  } catch (e) {
    logErr('me', e);
    return res.status(401).json({ ok: false, error: 'invalid_token' });
  }
});

/* ==========================================================
   POST /logout → clear session cookie
   ========================================================== */
router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, {
    domain: COOKIE_DOMAIN || undefined,
    path: '/',
    httpOnly: true,
    secure: COOKIE_SECURE === '1',
    sameSite: COOKIE_SAMESITE,
  });
  return res.json({ ok: true });
});

export default router;
