import crypto from 'crypto';

interface EncryptedData {
  encrypted: string;
  iv: string;
  tag: string;
}

export class EncryptionService {
  private encryptionKey: string;

  constructor() {
    // Use VPS encryption key or generate one from environment
    this.encryptionKey = process.env.VPS_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || '';

    if (!this.encryptionKey) {
      throw new Error('ENCRYPTION_KEY or VPS_ENCRYPTION_KEY must be set in environment variables');
    }
  }

  // AES-256-GCM encryption for maximum security
  encrypt(text: string): EncryptedData {
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex')
    };
  }

  // Decrypt AES-256-GCM encrypted data
  decrypt(encryptedData: EncryptedData): string {
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(encryptedData.iv, 'hex')
    );

    decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));

    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  // Generate secure hash for integrity verification
  generateHash(data: string): string {
    return crypto.createHmac('sha256', this.encryptionKey)
      .update(data)
      .digest('hex');
  }

  // Verify integrity of encrypted data
  verifyHash(data: string, hash: string): boolean {
    const computed = this.generateHash(data);
    return crypto.timingSafeEqual(
      Buffer.from(computed, 'hex'),
      Buffer.from(hash, 'hex')
    );
  }
}

export const encryptionService = new EncryptionService();
