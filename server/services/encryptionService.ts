import * as crypto from 'crypto';

// Legacy format (without salt) - for backward compatibility
interface LegacyEncryptedData {
  encrypted: string;
  iv: string;
  tag: string;
}

// New format with per-encryption salt
interface EncryptedData {
  encrypted: string;
  iv: string;
  tag: string;
  salt: string;  // Random salt per encryption
}

// Union type for decrypt to handle both formats
type EncryptedPayload = EncryptedData | LegacyEncryptedData;

// Type guard to check if payload has salt
function hasSalt(data: EncryptedPayload): data is EncryptedData {
  return 'salt' in data && typeof data.salt === 'string' && data.salt.length > 0;
}

// scrypt parameters for key derivation
const SCRYPT_PARAMS = {
  N: 16384,  // CPU/memory cost (2^14)
  r: 8,      // Block size
  p: 1,      // Parallelization
};

// Legacy static salt for backward compatibility with existing data
const LEGACY_SALT = 'salt';

export class EncryptionService {
  private encryptionKey: string;

  constructor() {
    // Use VPS encryption key or generate one from environment
    this.encryptionKey = process.env.VPS_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || '';

    if (!this.encryptionKey) {
      throw new Error('ENCRYPTION_KEY or VPS_ENCRYPTION_KEY must be set in environment variables');
    }
  }

  // Derive key from password and salt using scrypt
  private deriveKey(salt: Buffer | string): Buffer {
    return crypto.scryptSync(this.encryptionKey, salt, 32, SCRYPT_PARAMS);
  }

  // AES-256-GCM encryption with random per-encryption salt
  encrypt(text: string): EncryptedData {
    // Generate random salt for each encryption
    const salt = crypto.randomBytes(16);
    const key = this.deriveKey(salt);
    const iv = crypto.randomBytes(12);  // 12 bytes is recommended for GCM

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const encrypted = Buffer.concat([
      cipher.update(text, 'utf8'),
      cipher.final(),
    ]);

    const tag = cipher.getAuthTag();

    return {
      encrypted: encrypted.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      salt: salt.toString('base64'),
    };
  }

  // Decrypt AES-256-GCM encrypted data (supports both legacy and new format)
  decrypt(encryptedData: EncryptedPayload): string {
    let key: Buffer;
    let iv: Buffer;
    let tag: Buffer;
    let encrypted: Buffer;

    if (hasSalt(encryptedData)) {
      // New format with per-encryption salt (base64 encoded)
      const salt = Buffer.from(encryptedData.salt, 'base64');
      key = this.deriveKey(salt);
      iv = Buffer.from(encryptedData.iv, 'base64');
      tag = Buffer.from(encryptedData.tag, 'base64');
      encrypted = Buffer.from(encryptedData.encrypted, 'base64');
    } else {
      // Legacy format with static salt (hex encoded)
      key = this.deriveKey(LEGACY_SALT);
      iv = Buffer.from(encryptedData.iv, 'hex');
      tag = Buffer.from(encryptedData.tag, 'hex');
      encrypted = Buffer.from(encryptedData.encrypted, 'hex');
    }

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');
  }

  // Re-encrypt data with new salt (for migrating legacy data)
  reEncrypt(encryptedData: EncryptedPayload): EncryptedData {
    const plaintext = this.decrypt(encryptedData);
    return this.encrypt(plaintext);
  }

  // Check if data uses legacy format (no salt)
  isLegacyFormat(encryptedData: EncryptedPayload): boolean {
    return !hasSalt(encryptedData);
  }

  // Generate secure hash for integrity verification
  generateHash(data: string): string {
    return crypto.createHmac('sha256', this.encryptionKey)
      .update(data)
      .digest('hex');
  }

  // Verify integrity of encrypted data (timing-safe comparison)
  verifyHash(data: string, hash: string): boolean {
    const computed = this.generateHash(data);
    try {
      return crypto.timingSafeEqual(
        Buffer.from(computed, 'hex'),
        Buffer.from(hash, 'hex')
      );
    } catch {
      // If buffers are different lengths, they don't match
      return false;
    }
  }
}

export const encryptionService = new EncryptionService();

// Export types for use in other modules
export type { EncryptedData, LegacyEncryptedData, EncryptedPayload };
