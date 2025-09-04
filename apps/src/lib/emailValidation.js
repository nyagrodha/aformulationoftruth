// backend/src/lib/emailValidation.js (ESM)

/**
 * Lightweight, pragmatic email validator:
 * - basic shape local@domain
 * - no spaces, no consecutive dots, no leading/trailing dots
 * - TLD >= 2 chars
 * - total length sane limits
 */
export function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  const e = email.trim();
  if (e.length < 6 || e.length > 254) return false;
  if (/\s/.test(e)) return false;
  if (e.includes('..')) return false;

  const at = e.indexOf('@');
  if (at <= 0 || at === e.length - 1) return false;

  const local = e.slice(0, at);
  const domain = e.slice(at + 1);

  if (!local || !domain) return false;
  if (local.startsWith('.') || local.endsWith('.')) return false;
  if (domain.startsWith('.') || domain.endsWith('.')) return false;

  // very practical shape check; ESM-safe and fast
  const LOCAL_RX  = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/;
  const DOMAIN_RX = /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

  if (!LOCAL_RX.test(local)) return false;
  if (!DOMAIN_RX.test(domain)) return false;

  return true;
}

/**
 * Normalize email for storage/lookup:
 * - trim
 * - lowercase domain (and local for most providers; keep simple here)
 */
export function normalizeEmail(email) {
  const e = String(email || '').trim();
  const at = e.indexOf('@');
  if (at === -1) return e;
  return e.slice(0, at) + '@' + e.slice(at + 1).toLowerCase();
}

/**
 * Throws with helpful messages; use before insert.
 */
export function assertAcceptableEmail(email) {
  const e = String(email || '').trim();
  if (!e) throw new Error('email_required');
  if (!isValidEmail(e)) throw new Error('email_invalid_format');

  // Optional: block obvious throwaways (tweak list to taste)
  const disposableSnippets = ['mailinator', 'guerrillamail', '10minutemail', 'discard', 'tempmail'];
  const d = e.split('@')[1]?.toLowerCase() || '';
  if (disposableSnippets.some(s => d.includes(s))) {
    throw new Error('email_disposable_rejected');
  }

  return normalizeEmail(e);
}

// Friendly default for CJS interop if someone does require()
export default { isValidEmail, normalizeEmail, assertAcceptableEmail };

// Alias for older callers:
export const assertDeliverableEmail = assertAcceptableEmail;
