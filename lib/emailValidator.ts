/**
 * Email Validation and Normalization
 *
 * Provides validation and normalization for email addresses with
 * special handling for Gmail/Googlemail domains:
 * - Detects suspicious patterns (scattered periods, tiny segments)
 * - Normalizes Gmail addresses (removes dots, handles + aliases)
 * - Canonicalizes googlemail.com → gmail.com
 */

export type EmailValidationResult =
  | { valid: true; normalized: string }
  | { valid: false; reason: "invalid_format" | "suspicious_pattern" };

function splitEmail(input: string): { local: string; domain: string } | null {
  const at = input.indexOf("@");
  if (at <= 0) return null; // no @ or empty local
  // Ensure only one @
  if (input.indexOf("@", at + 1) !== -1) return null;

  const local = input.slice(0, at);
  const domain = input.slice(at + 1);
  if (!domain) return null;

  return { local, domain };
}

// Lightweight format check (not full RFC; "good enough")
function isReasonablyValidEmail(local: string, domain: string): boolean {
  if (!local || !domain) return false;
  if (local.includes(" ") || domain.includes(" ")) return false;

  // domain must contain at least one dot, not at ends, no empty labels
  const firstDot = domain.indexOf(".");
  if (firstDot <= 0 || firstDot === domain.length - 1) return false;
  if (domain.includes("..")) return false;

  return true;
}

function isGmailDomain(domain: string): boolean {
  return domain === "gmail.com" || domain === "googlemail.com";
}

/**
 * One-pass suspiciousness check:
 * - period count
 * - "tiny segments" (length <= 2) count
 * Tiny segments are counted between dots. Empty segments (leading/trailing dot,
 * or consecutive dots) count as tiny too (and are suspicious in practice).
 */
export function isSuspiciousGmailParts(local: string, domain: string): boolean {
  if (!isGmailDomain(domain)) return false;

  let periods = 0;
  let tinySegments = 0;

  let segLen = 0;

  for (let i = 0; i < local.length; i++) {
    const c = local.charCodeAt(i);
    if (c === 46 /* '.' */) {
      periods++;
      if (segLen <= 2) tinySegments++;
      segLen = 0;

      // early exits
      if (periods > 3) return true;
      if (tinySegments >= 3) return true;
    } else {
      segLen++;
    }
  }

  // last segment
  if (segLen <= 2) tinySegments++;
  if (tinySegments >= 3) return true;

  // density check
  if (local.length > 0 && periods / local.length > 0.12) return true;

  return false;
}

/**
 * Normalize Gmail in one pass:
 * - stop at '+'
 * - drop '.'
 * - canonicalize domain to gmail.com
 */
export function normalizeEmailParts(local: string, domain: string): string {
  if (!isGmailDomain(domain)) {
    return `${local}@${domain}`;
  }

  let out = "";
  for (let i = 0; i < local.length; i++) {
    const c = local.charCodeAt(i);
    if (c === 43 /* '+' */) break;
    if (c === 46 /* '.' */) continue;
    out += local[i];
  }

  return `${out}@gmail.com`;
}

/**
 * Main validation entry point.
 *
 * Returns either:
 * - { valid: true, normalized: string } - email is valid and normalized
 * - { valid: false, reason: "invalid_format" | "suspicious_pattern" }
 */
export function validateEmail(email: string): EmailValidationResult {
  const trimmed = email.trim();
  const lower = trimmed.toLowerCase();

  const parts = splitEmail(lower);
  if (!parts) return { valid: false, reason: "invalid_format" };

  const { local, domain } = parts;

  if (!isReasonablyValidEmail(local, domain)) {
    return { valid: false, reason: "invalid_format" };
  }

  if (isSuspiciousGmailParts(local, domain)) {
    return { valid: false, reason: "suspicious_pattern" };
  }

  return { valid: true, normalized: normalizeEmailParts(local, domain) };
}

/**
 * Legacy compatibility wrapper.
 * @deprecated Use validateEmail() instead
 */
export function isSuspiciousGmail(email: string): boolean {
  const result = validateEmail(email);
  return !result.valid && result.reason === "suspicious_pattern";
}
