/**
 * Newsletter Subscription Encryption Module
 * Provides AES-256-GCM encryption for newsletter subscriber data
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const SALT = 'newsletter_encryption_salt_2024';

/**
 * Get or validate encryption key from environment
 * @returns Buffer containing the encryption key
 */
export function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET;

  if (!key) {
    throw new Error('ENCRYPTION_KEY or JWT_SECRET must be set in environment variables');
  }

  // Ensure key is exactly 32 bytes by hashing if necessary
  if (key.length !== KEY_LENGTH) {
    return crypto.pbkdf2Sync(key, SALT, 100000, KEY_LENGTH, 'sha256');
  }

  return Buffer.from(key, 'utf8');
}

/**
 * Encrypt sensitive data using AES-256-GCM
 * @param data - String data to encrypt
 * @param key - Encryption key (optional, uses env key if not provided)
 * @returns Object with encrypted data and IV
 */
export function encryptData(data: string, key?: Buffer): { encrypted: Buffer; iv: Buffer } {
  try {
    const encryptionKey = key || getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv);

    let encrypted = cipher.update(data, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    const authTag = cipher.getAuthTag();

    // Combine encrypted data with auth tag
    const combinedData = Buffer.concat([encrypted, authTag]);

    return {
      encrypted: combinedData,
      iv: iv
    };
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt data encrypted with encryptData
 * @param encryptedData - Buffer containing encrypted data and auth tag
 * @param iv - Initialization vector used for encryption
 * @param key - Encryption key (optional, uses env key if not provided)
 * @returns Decrypted string
 */
export function decryptData(encryptedData: Buffer, iv: Buffer, key?: Buffer): string {
  try {
    const encryptionKey = key || getEncryptionKey();

    // Extract auth tag from the end of encrypted data
    const authTag = encryptedData.subarray(encryptedData.length - TAG_LENGTH);
    const actualEncrypted = encryptedData.subarray(0, encryptedData.length - TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(actualEncrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Hash email for duplicate checking without storing plaintext
 * @param email - Email address to hash
 * @returns SHA-256 hash of the email
 */
export function hashEmail(email: string): string {
  const normalizedEmail = email.toLowerCase().trim();
  return crypto.createHash('sha256')
    .update(normalizedEmail + SALT)
    .digest('hex');
}

/**
 * Generate a unique subscription ID
 * @returns UUID v4 string
 */
export function generateSubscriptionId(): string {
  return crypto.randomUUID();
}

/**
 * Validate encryption key on module load
 */
export function validateEncryptionSetup(): boolean {
  try {
    const key = getEncryptionKey();
    if (key.length !== KEY_LENGTH) {
      console.error('Invalid encryption key length');
      return false;
    }
    return true;
  } catch (error) {
    console.error('Encryption setup validation failed:', error);
    return false;
  }
}