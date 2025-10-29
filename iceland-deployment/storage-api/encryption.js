/**
 * Encryption Service
 * Provides AES-256-GCM encryption/decryption and HMAC-SHA256 integrity verification
 *
 * Encryption: AES-256-GCM (Galois/Counter Mode)
 * - 256-bit key (from ENCRYPTION_KEY env var)
 * - Random 16-byte IV per encryption
 * - Additional Authenticated Data (AAD): "formulation-of-truth"
 * - Authentication tag for integrity
 *
 * Integrity: HMAC-SHA256
 * - Hash of encrypted data with encryption key
 * - Format: sessionId:questionId:encryptedAnswer:timestamp
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const AAD = 'formulation-of-truth';

class EncryptionService {
  constructor(encryptionKey) {
    if (!encryptionKey || encryptionKey.length !== 64) {
      throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
    }
    this.key = Buffer.from(encryptionKey, 'hex');
  }

  /**
   * Encrypt data with AES-256-GCM
   * @param {string} plaintext - Data to encrypt
   * @returns {Object} - { iv, encrypted, tag } all as hex strings
   */
  encrypt(plaintext) {
    try {
      // Generate random IV
      const iv = crypto.randomBytes(IV_LENGTH);

      // Create cipher
      const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);
      cipher.setAAD(Buffer.from(AAD));

      // Encrypt data
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // Get authentication tag
      const tag = cipher.getAuthTag();

      return {
        iv: iv.toString('hex'),
        encrypted: encrypted,
        tag: tag.toString('hex')
      };
    } catch (error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt data with AES-256-GCM
   * @param {string} ivHex - IV as hex string
   * @param {string} encryptedHex - Encrypted data as hex string
   * @param {string} tagHex - Authentication tag as hex string
   * @returns {string} - Decrypted plaintext
   */
  decrypt(ivHex, encryptedHex, tagHex) {
    try {
      // Convert hex strings to buffers
      const iv = Buffer.from(ivHex, 'hex');
      const encrypted = Buffer.from(encryptedHex, 'hex');
      const tag = Buffer.from(tagHex, 'hex');

      // Create decipher
      const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);
      decipher.setAAD(Buffer.from(AAD));
      decipher.setAuthTag(tag);

      // Decrypt data
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Generate HMAC-SHA256 integrity hash
   * @param {string} data - Data to hash
   * @returns {string} - HMAC hash as hex string
   */
  generateIntegrityHash(data) {
    return crypto
      .createHmac('sha256', this.key)
      .update(data)
      .digest('hex');
  }

  /**
   * Verify HMAC-SHA256 integrity hash
   * @param {string} data - Original data
   * @param {string} hash - Hash to verify
   * @returns {boolean} - True if valid
   */
  verifyIntegrityHash(data, hash) {
    const expectedHash = this.generateIntegrityHash(data);
    return crypto.timingSafeEqual(
      Buffer.from(hash, 'hex'),
      Buffer.from(expectedHash, 'hex')
    );
  }

  /**
   * Encrypt response data (convenience method)
   * @param {Object} response - Response object with sessionId, questionId, answer, timestamp
   * @returns {Object} - Encrypted response with integrity hash
   */
  encryptResponse(response) {
    const { sessionId, questionId, answer, timestamp } = response;

    // Encrypt answer
    const encrypted = this.encrypt(answer);

    // Generate integrity hash
    const integrityData = `${sessionId}:${questionId}:${encrypted.encrypted}:${timestamp}`;
    const integrityHash = this.generateIntegrityHash(integrityData);

    return {
      sessionId,
      questionId,
      encryptedAnswer: encrypted.encrypted,
      iv: encrypted.iv,
      tag: encrypted.tag,
      timestamp,
      integrityHash
    };
  }

  /**
   * Decrypt response data (convenience method)
   * @param {Object} encryptedResponse - Encrypted response object
   * @returns {Object} - Decrypted response
   */
  decryptResponse(encryptedResponse) {
    const { sessionId, questionId, encryptedAnswer, iv, tag, timestamp, integrityHash } = encryptedResponse;

    // Verify integrity first
    const integrityData = `${sessionId}:${questionId}:${encryptedAnswer}:${timestamp}`;
    if (!this.verifyIntegrityHash(integrityData, integrityHash)) {
      throw new Error('Integrity verification failed');
    }

    // Decrypt answer
    const answer = this.decrypt(iv, encryptedAnswer, tag);

    return {
      sessionId,
      questionId,
      answer,
      timestamp
    };
  }
}

module.exports = EncryptionService;
