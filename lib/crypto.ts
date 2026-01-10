/**
 * Cryptographic Utilities
 *
 * gupta-vidya compliance:
 * - Uses Web Crypto API (browser-compatible, Deno-native)
 * - Hash-and-discard pattern for sensitive data
 * - No plaintext persistence
 * - Ephemeral keys where possible
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Generate cryptographically secure random bytes
 */
export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * Generate a secure random token as hex string
 */
export function randomToken(byteLength = 32): string {
  const bytes = randomBytes(byteLength);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Hash data using SHA-256.
 * Use for: email hashing, token verification, content integrity.
 */
export async function sha256(data: string | Uint8Array): Promise<string> {
  const input = typeof data === 'string' ? encoder.encode(data) : data;
  const hashBuffer = await crypto.subtle.digest('SHA-256', input);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Hash email using SHA-256 for storage.
 * Email is immediately discarded after hashing - never stored in plaintext.
 *
 * gupta-vidya: email = delivery only, not identity.
 * We store only the hash for lookup, original is ephemeral.
 */
export async function hashEmail(email: string): Promise<string> {
  // Normalize: lowercase, trim
  const normalized = email.toLowerCase().trim();
  return sha256(normalized);
}

/**
 * Derive encryption key from password using PBKDF2.
 */
export async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations = 100000
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data using AES-256-GCM.
 * Returns base64-encoded ciphertext with IV prepended.
 */
export async function encrypt(
  plaintext: string,
  key: CryptoKey
): Promise<string> {
  const iv = randomBytes(12); // 96-bit IV for GCM
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  );

  // Prepend IV to ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt AES-256-GCM encrypted data.
 */
export async function decrypt(
  encryptedBase64: string,
  key: CryptoKey
): Promise<string> {
  const combined = Uint8Array.from(atob(encryptedBase64), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  return decoder.decode(plaintext);
}

/**
 * Generate HMAC-SHA256 signature.
 * Use for: request signing, token validation.
 */
export async function hmacSign(
  data: string,
  secretKey: Uint8Array
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    secretKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Verify HMAC-SHA256 signature using constant-time comparison.
 */
export async function hmacVerify(
  data: string,
  signature: string,
  secretKey: Uint8Array
): Promise<boolean> {
  const expectedSignature = await hmacSign(data, secretKey);

  if (signature.length !== expectedSignature.length) {
    return false;
  }

  // Constant-time comparison
  let result = 0;
  for (let i = 0; i < signature.length; i++) {
    result |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Check if timestamp is within acceptable window (replay protection).
 * Default: 5 minute window.
 */
export function isTimestampValid(
  timestamp: number,
  windowMs = 5 * 60 * 1000
): boolean {
  const now = Date.now();
  return Math.abs(now - timestamp) <= windowMs;
}

/**
 * Generate opaque resume token (32 bytes = 64 hex chars = 256 bits).
 * This token is sent to the client and NEVER stored in the database.
 * Only its HMAC hash is stored.
 *
 * Use case: Questionnaire session resumption without email in URL.
 */
export function generateResumeToken(): string {
  return randomToken(32); // 32 bytes = 256 bits
}

/**
 * Hash resume token using HMAC-SHA256 with server secret.
 * This hash becomes the session_id (primary key in database).
 *
 * Why HMAC instead of plain SHA-256?
 * - Prevents token guessing even if database is compromised
 * - Requires server secret to compute valid session_id
 * - Provides cryptographic binding between token and session
 *
 * @param token - Opaque resume token (64 hex chars)
 * @returns HMAC-SHA256 hash (64 hex chars) used as session_id
 */
export async function hashResumeToken(token: string): Promise<string> {
  const secret = Deno.env.get('RESUME_TOKEN_SECRET');
  if (!secret) {
    throw new Error('RESUME_TOKEN_SECRET not configured');
  }

  const secretBytes = encoder.encode(secret);
  return await hmacSign(token, secretBytes);
}

/**
 * Verify resume token against stored hash.
 * Constant-time comparison to prevent timing attacks.
 *
 * @param token - Opaque token from client
 * @param storedHash - HMAC hash from database
 * @returns True if token is valid
 */
export async function verifyResumeToken(
  token: string,
  storedHash: string
): Promise<boolean> {
  const secret = Deno.env.get('RESUME_TOKEN_SECRET');
  if (!secret) {
    throw new Error('RESUME_TOKEN_SECRET not configured');
  }

  const secretBytes = encoder.encode(secret);
  return await hmacVerify(token, storedHash, secretBytes);
}
