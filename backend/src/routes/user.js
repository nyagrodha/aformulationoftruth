// backend/src/routes/user.js  (ESM)
import { Router } from 'express';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

const router = Router();

// ---------- helpers ----------
const PUBLIC_URL = process.env.PUBLIC_URL || 'https://aformulationoftruth.com';
const MAGIC_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function signMagicPayload(payloadObj, secret) {
  const payload = b64url(JSON.stringify(payloadObj));
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyMagicToken(token, secret) {
  if (!token || !token.includes('.')) return { ok: false, error: 'bad_format' };
  const [payloadB64, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return { ok: false, error: 'bad_signature' };
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, error: 'bad_json' };
  }
  if (!payload?.email || !payload?.exp || Date.now() > Number(payload.exp)) {
    return { ok: false, error: 'expired_or_invalid' };
  }
  return { ok: true, payload };
}

// very small allowlist for next=; avoid open redirects
function sanitizeNext(next) {
  if (typeof next !== 'string') return '/questionnaire';
  try {
    // only allow same-origin absolute URLs or path-absolute
    if (next.startsWith('http')) {
      const u = new URL(next);
      if (u.origin === new URL(PUBLIC_URL).origin) return u.pathname + u.search + u.hash;
      return '/questionnaire';
    }
    return next.startsWith('/') ? next : '/questionnaire';
  } catch {
    return '/questionnaire';
  }
}

function buildTransport() {
  const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' ||
                 String(process.env.SMTP_PORT || '') === '465';
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || (secure ? 465 : 587)),
    secure,
    auth: (process.env.SMTP_USER && process.env.SMTP_PASS)
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

// ---------- routes ----------

// POST /user/magic/start  { email, next? }
router.post('/magic/start', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const next = sanitizeNext(req.body?.next);
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: 'invalid_email' });
    }
    if (!process.env.MAGIC_TOKEN_SECRET) {
      console.error('[auth] MAGIC_TOKEN_SECRET missing');
      return res.status(500).json({ ok: false });
    }

    const payload = {
      email,
      nonce: crypto.randomBytes(12).toString('hex'),
      exp: Date.now() + MAGIC_TOKEN_TTL_MS,
    };
    const token = signMagicPayload(payload, process.env.MAGIC_TOKEN_SECRET);

    // verification URL hits /user/magic/verify first (clean redirect to /finish)
    const verifyUrl = new URL('/user/magic/verify', PUBLIC_URL);
    verifyUrl.searchParams.set('token', token);
    verifyUrl.searchParams.set('next', next);

    // send email (best-effort; avoid leaking whether email exists)
    try {
      const transport = buildTransport();
      const from = process.env.MAIL_FROM || 'no-reply@aformulationoftruth.com';
      await transport.sendMail({
        from,
        to: email,
        subject: 'Your sign-in link • a formulation of truth',
        text:
`Click to sign in:

${verifyUrl.toString()}

This link expires in 15 minutes. If you didn't request it, you can ignore this email.`,
        html:
`<p>Click to sign in:</p>
<p><a href="${verifyUrl.toString()}">${verifyUrl.toString()}</a></p>
<p>This link expires in <b>15 minutes</b>. If you didn't request it, you can ignore this email.</p>`
      });
    } catch (e) {
      console.error('[auth] sendMail failed:', e.message);
      // continue; we still answer ok to avoid account enumeration
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[auth] /magic/start error:', err);
    return res.status(500).json({ ok: false });
  }
});

// GET /user/magic/verify?token=...&next=/questionnaire
// (just normalizes the URL and forwards to finish)
router.get('/magic/verify', (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const next  = sanitizeNext(req.query.next);
  const dest  = `/user/magic/finish?token=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`;
  return res.redirect(302, dest);
});

// GET /user/magic/finish?token=...&next=/questionnaire
// verifies token, creates a session, and redirects
router.get('/magic/finish', async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const next  = sanitizeNext(req.query.next);

  if (!process.env.MAGIC_TOKEN_SECRET) {
    console.error('[auth] MAGIC_TOKEN_SECRET missing');
    return res.redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  const { ok, payload } = verifyMagicToken(token, process.env.MAGIC_TOKEN_SECRET);
  if (!ok) {
    return res.redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  // Minimal session; later you can upsert user in Postgres and attach an id
  req.session.user = { email: payload.email, seenAt: Date.now() };
  // Persist session before redirect to avoid race behind proxies
  req.session.save(() => res.redirect(next));
});

// POST /user/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

export default router;
