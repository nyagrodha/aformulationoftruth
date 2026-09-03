/**
 * JWT Utilities for Questionnaire Sessions
 *
 * JWT contains: email_hash, session_id, iat, exp
 * Used for:
 * 1. Client-side encryption key derivation (email_hash)
 * 2. Session verification (session_id)
 * 3. Preventing token replay (exp)
 *
 * gupta-vidya compliance:
 * - No plaintext email in JWT
 * - Only hash for encryption purposes
 * - Short-lived (24 hours)
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Read the JWT secret lazily, on each use.
 *
 * It must NOT be captured at module-eval time: main.ts loads .env AFTER the
 * route manifest (and therefore this module) is imported, so a top-level read
 * would always observe `undefined` and every signing/verification call would
 * throw "JWT_SECRET not configured" at request time. Reading on demand
 * guarantees the value is present once the server is handling requests.
 */
function getJwtSecret(): string {
  const secret = Deno.env.get('JWT_SECRET');
  if (!secret) {
    throw new Error('JWT_SECRET not configured');
  }
  return secret;
}

const JWT_VALIDITY_HOURS = 24;

/**
 * How the holder of this token proved the address behind it.
 *
 * 'gate' means someone typed an address into the gate and nothing more; 'link'
 * means they opened what was mailed to that address. Only 'link' is proof of
 * control, and lib/api-auth.ts refuses every write that does not carry it --
 * without the distinction, anyone types any address and gets an identity that
 * the messaging surface then attributes their writing to in front of someone
 * else.
 *
 * Optional only because tokens minted before this claim existed are still
 * within their 24-hour validity. A claimless token is never read as 'link' on
 * its own: authenticateRequest answers 'gate' unless the holder also presents
 * the resume token for that same session, which is delivered only by mail and
 * so proves what 'link' asserts. See lib/session-auth.ts, which carries the
 * reasoning and the deployed-fleet counterexample that forces it.
 */
export type JWTVia = 'gate' | 'link';

export interface JWTPayload {
  email_hash: string; // For client-side encryption key derivation
  session_id: string; // HMAC hash of opaque token
  via?: JWTVia; // How the address was proved -- see JWTVia
  iat: number; // Issued at (Unix timestamp)
  exp: number; // Expiration (Unix timestamp)
}

/**
 * Get current Unix timestamp (seconds).
 */
function getCurrentTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Get Unix timestamp for future time.
 */
function getFutureTimestamp(seconds: number): number {
  return getCurrentTimestamp() + seconds;
}

/**
 * Create JWT for questionnaire session.
 *
 * @param emailHash - SHA-256 hash of email (for client-side encryption)
 * @param sessionId - HMAC hash of opaque token (session identifier)
 * @param via - How the address was proved. Pass 'gate' unless the caller knows
 *   the holder opened the emailed link; see JWTVia.
 * @returns JWT token string
 */
export async function createQuestionnaireJWT(
  emailHash: string,
  sessionId: string,
  via: JWTVia,
): Promise<string> {
  const secret = getJwtSecret();

  // Import secret key for HMAC signing
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  // Build JWT payload
  const payload: JWTPayload = {
    email_hash: emailHash,
    session_id: sessionId,
    via,
    iat: getCurrentTimestamp(),
    exp: getFutureTimestamp(JWT_VALIDITY_HOURS * 60 * 60),
  };

  // Create JWT header
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  // Base64url encode header and payload
  const headerB64 = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(payload));

  // Create signature
  const signatureInput = `${headerB64}.${payloadB64}`;
  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(signatureInput),
  );
  const signatureB64 = base64urlEncode(signatureBuffer);

  // Return complete JWT
  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

/**
 * Verify and decode JWT.
 *
 * @param token - JWT token string
 * @returns Payload if valid, null if invalid or expired
 */
export async function verifyQuestionnaireJWT(
  token: string,
): Promise<JWTPayload | null> {
  const secret = getJwtSecret();

  try {
    // Split JWT into parts
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.error('[jwt] Invalid JWT format');
      return null;
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    // Import secret key for HMAC verification
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );

    // Verify signature
    const signatureInput = `${headerB64}.${payloadB64}`;
    const signatureBuffer = base64urlDecode(signatureB64);

    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBuffer,
      encoder.encode(signatureInput),
    );

    if (!isValid) {
      console.error('[jwt] Invalid signature');
      return null;
    }

    // Decode payload
    const payloadJson = base64urlDecodeToString(payloadB64);
    const payload = JSON.parse(payloadJson) as JWTPayload;

    // Check expiration
    const now = getCurrentTimestamp();
    if (payload.exp < now) {
      console.error('[jwt] Token expired');
      return null;
    }

    // Validate required fields
    if (!payload.email_hash || !payload.session_id) {
      console.error('[jwt] Missing required fields');
      return null;
    }

    return payload;
  } catch {
    /* Never the object: a malformed-token throw can quote the token itself. */
    console.error('[jwt] Verification failed');
    return null;
  }
}

/**
 * Decode JWT payload without verification (for debugging).
 * WARNING: Do not use for authentication - signature is not verified!
 */
export function decodeJWTPayload(token: string): JWTPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payloadJson = base64urlDecodeToString(parts[1]);
    return JSON.parse(payloadJson) as JWTPayload;
  } catch {
    return null;
  }
}

/**
 * Base64url encode (RFC 4648).
 */
function base64urlEncode(input: string | ArrayBuffer): string {
  let bytes: Uint8Array;

  if (typeof input === 'string') {
    bytes = encoder.encode(input);
  } else {
    bytes = new Uint8Array(input);
  }

  // Convert to base64
  const base64 = btoa(String.fromCharCode(...bytes));

  // Convert to base64url
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Base64url decode to Uint8Array.
 *
 * Pinned to `<ArrayBuffer>` for the same reason as lib/crypto.ts: the result
 * is handed to crypto.subtle.verify as a BufferSource, which the default
 * `Uint8Array<ArrayBufferLike>` does not satisfy.
 */
function base64urlDecode(input: string): Uint8Array<ArrayBuffer> {
  // Convert base64url to base64
  let base64 = input
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  // Add padding
  const padding = base64.length % 4;
  if (padding > 0) {
    base64 += '='.repeat(4 - padding);
  }

  // Decode base64
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return bytes;
}

/**
 * Base64url decode to string.
 */
function base64urlDecodeToString(input: string): string {
  const bytes = base64urlDecode(input);
  return decoder.decode(bytes);
}

/**
 * Check if JWT is expired without full verification.
 * Useful for client-side checks.
 */
export function isJWTExpired(token: string): boolean {
  const payload = decodeJWTPayload(token);
  if (!payload) return true;

  const now = getCurrentTimestamp();
  return payload.exp < now;
}

/**
 * Get time remaining until JWT expiration (in seconds).
 */
export function getJWTTimeRemaining(token: string): number {
  const payload = decodeJWTPayload(token);
  if (!payload) return 0;

  const now = getCurrentTimestamp();
  return Math.max(0, payload.exp - now);
}
