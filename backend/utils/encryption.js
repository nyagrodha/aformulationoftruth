// utils/encryption.js
// Email encryption/decryption utilities using AES-256-GCM
import crypto from 'crypto';

// Algorithm configuration
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // For GCM mode
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32; // 256 bits
const PBKDF2_ITERATIONS = 100000;

/**
 * Derives an encryption key from a passphrase using PBKDF2
 * @param {string} passphrase - The master passphrase
 * @param {Buffer} salt - The salt for key derivation
 * @returns {Buffer} The derived key
 */
function deriveKey(passphrase, salt) {
  return crypto.pbkdf2Sync(
    passphrase,
    salt,
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    'sha256'
  );
}

/**
 * Get encryption passphrase from environment
 * @returns {string} The encryption passphrase
 */
function getPassphrase() {
  const passphrase = process.env.EMAIL_ENCRYPTION_KEY;
  if (!passphrase) {
    throw new Error('EMAIL_ENCRYPTION_KEY environment variable not set');
  }
  if (passphrase.length < 32) {
    throw new Error('EMAIL_ENCRYPTION_KEY must be at least 32 characters long');
  }
  return passphrase;
}

/**
 * Encrypts an email address
 * @param {string} email - The email address to encrypt
 * @returns {string} Base64-encoded encrypted data (salt + iv + authTag + encryptedData)
 */
export function encryptEmail(email) {
  try {
    const passphrase = getPassphrase();

    // Generate random salt and IV
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);

    // Derive key from passphrase
    const key = deriveKey(passphrase, salt);

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // Encrypt the email
    let encrypted = cipher.update(email, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    // Combine salt + iv + authTag + encrypted data
    const combined = Buffer.concat([salt, iv, authTag, encrypted]);

    // Return as base64 string
    return combined.toString('base64');
  } catch (error) {
    throw new Error(`Email encryption failed: ${error.message}`);
  }
}

/**
 * Decrypts an email address
 * @param {string} encryptedData - Base64-encoded encrypted email
 * @returns {string} The decrypted email address
 */
export function decryptEmail(encryptedData) {
  try {
    const passphrase = getPassphrase();

    // Convert from base64
    const combined = Buffer.from(encryptedData, 'base64');

    // Extract components
    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = combined.slice(
      SALT_LENGTH + IV_LENGTH,
      SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
    );
    const encrypted = combined.slice(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

    // Derive key from passphrase
    const key = deriveKey(passphrase, salt);

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt the email
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
  } catch (error) {
    throw new Error(`Email decryption failed: ${error.message}`);
  }
}

/**
 * Validates email format
 * @param {string} email - The email to validate
 * @returns {boolean} True if valid email format
 */
export function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Generates a secure encryption key (for initial setup)
 * @returns {string} A random 64-character hex string suitable for EMAIL_ENCRYPTION_KEY
 */
export function generateEncryptionKey() {
  return crypto.randomBytes(32).toString('hex');
}
