import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { URL } from 'node:url';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/* ---------- Config ---------- */
const SECRET =
  process.env.MAGIC_LINK_SECRET ||
  process.env.SESSION_SECRET ||
  process.env.JWT_SECRET ||
  null;

if (!SECRET) {
  console.warn('[authMail] No MAGIC_LINK_SECRET/SESSION_SECRET/JWT_SECRET set.');
}

const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || process.env.PUBLIC_BASE_URL || 'https://aformulationoftruth.com';
const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || 'Karuppacāmi Nirmeyappōr';
const MAIL_FROM_ADDR = process.env.MAIL_FROM_ADDR || process.env.SMTP_FROM || 'thoughtlessness@aformulationoftruth.com';

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.mail.me.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'false') === 'true';
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_DEBUG = String(process.env.SMTP_DEBUG || 'false') === 'true';
const NODE_ENV = process.env.NODE_ENV;

/* ---------- Token helpers ---------- */
const b64u = (buf) => Buffer.from(buf).toString('base64url');
export function makeMagicToken(bytes = 32) { return b64u(crypto.randomBytes(bytes)); }
export function hashToken(token) { return crypto.createHmac('sha256', SECRET || 'insecure').update(token).digest('base64url'); }
export function buildVerifyUrl(token, email) {
  const u = new URL('/api/auth/verify', PUBLIC_ORIGIN);
  u.searchParams.set('token', token);
  if (email) u.searchParams.set('email', email);
  return u.toString();
}

/* ---------- Transport ---------- */
function buildTransport() {
  if (!SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    requireTLS: !SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    tls: { rejectUnauthorized: true },
    logger: SMTP_DEBUG,
    debug: SMTP_DEBUG,
  });
}

/* ---------- Email content (styling functions omitted for brevity) ---------- */
const esc = (s='') => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function isBhairavaWindow(now = new Date(), timezone = 'America/Chicago') {
  try {
    const f = new Intl.DateTimeFormat('en-US',{ timeZone: timezone, hour12:false, hour:'2-digit', minute:'2-digit' });
    const p = f.formatToParts(now);
    const hh = Number(p.find(x=>x.type==='hour')?.value||'0');
    const mm = Number(p.find(x=>x.type==='minute')?.value||'0');
    return hh===1 && mm<=14;
  } catch { return false; }
}
function renderSubject() { return 'உங்கள் மந்திர இணைப்பு • Your magic sign-in link'; }
function renderText({ verifyUrl, timezone }) { /* ... as previously defined ... */ return `Your link: ${verifyUrl}` }
function renderHtml({ verifyUrl, timezone }) { /* ... as previously defined ... */ return `<a href="${verifyUrl}">Sign In</a>` }


/* ---------- Send API ---------- */
export async function sendMagicLink({ to, verifyUrl, timezone }) {
  if (!to || typeof to !== 'string' || !verifyUrl || typeof verifyUrl !== 'string') {
    console.error('[authMail] Invalid arguments provided to sendMagicLink.');
    return { ok: false, error: 'invalid_arguments' };
  }
  const transporter = buildTransport();
  if (!transporter) {
    console.log('[authMail] SMTP disabled; printing link:', { to, verifyUrl });
    return { ok: true, mocked: true };
  }
  try {
    const info = await transporter.sendMail({
      from: `"${MAIL_FROM_NAME}" <${MAIL_FROM_ADDR}>`,
      to,
      subject: renderSubject(),
      html: renderHtml({ verifyUrl, timezone }),
      text: renderText({ verifyUrl, timezone }),
      headers: { 'X-A4M-App': 'aformulationoftruth.com' },
    });
    if (NODE_ENV !== 'production') console.log('[mailer] sent:', info.messageId);
    return { ok: true, messageId: info.messageId };
  } catch (error) {
    console.error('[authMail] Failed to send email:', error);
    return { ok: false, error: error.message };
  }
}

/* ---------- Debug Functions ---------- */
export async function debugSmtpConnection() {
  console.log('[Debug] Checking SMTP configuration...');
  const transporter = buildTransport();
  if (!transporter) {
    console.error('[Debug] SMTP is not configured (missing SMTP_USER or SMTP_PASS).');
    return;
  }
  try {
    const success = await transporter.verify();
    if (success) {
      console.log('✅ SMTP Connection and Authentication Successful!');
      console.log(`   - Host: ${SMTP_HOST}`);
      console.log(`   - User: ${SMTP_USER}`);
    }
  } catch (error) {
    console.error('❌ SMTP Connection Failed:', error);
  }
}
export async function debugRenderEmail() {
  console.log('[Debug] Rendering sample email to debug_email.html...');
  const dummyToken = makeMagicToken();
  const dummyUrl = buildVerifyUrl(dummyToken, 'test@example.com');
  const html = renderHtml({ verifyUrl: dummyUrl, timezone: 'America/Chicago' });
  const filePath = path.join(os.homedir(), 'debug_email.html');
  await fs.writeFile('debug_email.html', html);
  console.log('✅ Successfully wrote sample email to debug_email.html.');
}

export default { makeMagicToken, hashToken, buildVerifyUrl, sendMagicLink };
