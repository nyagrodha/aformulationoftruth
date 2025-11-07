/**
 * Server-side Decryption Service - Unveiling the Gupta Vidyā
 * गुप्त-विद्या - Server-Side Decryption
 *
 * This service receives encrypted transmissions and reveals
 * their true nature through proper adhikāra (authorization)
 *
 * The server acts as the guru who unveils the secret knowledge
 * only when the transmission is fresh and properly sealed
 */

const crypto = require('crypto');

class GuptaVidyaDecryption {
  constructor() {
    this.config = {
      algorithm: 'aes-256-gcm',
      maxAge: 5 * 60 * 1000  // 5 minutes - duration of śakti freshness
    };
  }

  /**
   * Decrypt the email package - unveil the hidden identity
   *
   * @param {Object} securePackage - The encrypted package from client
   * @returns {Promise<Object>} Decrypted email and validation status
   */
  async decryptPackage(securePackage) {
    try {
      console.log('📿 Received encrypted transmission at', new Date().toISOString());

      // Validate timestamp - ensure freshness of the transmission
      if (!this.validateTimestamp(securePackage.timestamp)) {
        throw new Error('Stale encryption - śakti has dissipated beyond the 5-minute window');
      }
      console.log('⏱️  Timestamp validated - śakti is fresh');

      // Verify signature - check the mudra (seal)
      if (!await this.verifySignature(securePackage)) {
        throw new Error('Invalid signature - mudra is broken');
      }
      console.log('🔏 Signature verified - mudra intact');

      // Decode from base64
      const encryptedBuffer = Buffer.from(securePackage.encryptedEmail, 'base64');
      const iv = Buffer.from(securePackage.iv, 'base64');
      const salt = Buffer.from(securePackage.salt, 'base64');
      const keyData = JSON.parse(Buffer.from(securePackage.ephemeralKey, 'base64').toString());

      // Import the ephemeral key
      const key = await this.importKey(keyData);
      console.log('🔑 Ephemeral key imported');

      // Extract auth tag (last 16 bytes for GCM)
      const authTag = encryptedBuffer.slice(-16);
      const ciphertext = encryptedBuffer.slice(0, -16);

      // Create decipher
      const decipher = crypto.createDecipheriv(this.config.algorithm, key, iv);
      decipher.setAuthTag(authTag);

      // Decrypt the email
      let decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final()
      ]);

      // The revealed email
      const email = decrypted.toString('utf8');
      console.log('✨ Email unveiled:', email.replace(/(.{3}).*(@.*)/, '$1***$2'));

      return {
        email,
        isValid: this.validateEmail(email)
      };

    } catch (error) {
      console.error('❌ Decryption failed - gupta vidyā remains hidden:', error.message);
      throw new Error('Failed to unveil the secret knowledge: ' + error.message);
    }
  }

  /**
   * Validate timestamp - ensure the śakti is fresh
   * Encrypted packages older than 5 minutes are rejected
   */
  validateTimestamp(timestamp) {
    if (typeof timestamp !== 'number') {
      return false;
    }

    const age = Date.now() - timestamp;
    return age >= 0 && age < this.config.maxAge;
  }

  /**
   * Verify signature integrity - check the mudra
   * Ensures the package has not been tampered with
   */
  async verifySignature(securePackage) {
    try {
      // Reconstruct the signed data
      const encryptedBuffer = Buffer.from(securePackage.encryptedEmail, 'base64');
      const iv = Buffer.from(securePackage.iv, 'base64');
      const salt = Buffer.from(securePackage.salt, 'base64');

      const combined = Buffer.concat([encryptedBuffer, iv, salt]);

      // Generate hash
      const computedSignature = crypto
        .createHash('sha256')
        .update(combined)
        .digest('base64');

      return computedSignature === securePackage.signature;
    } catch (error) {
      console.error('Signature verification failed:', error);
      return false;
    }
  }

  /**
   * Import the ephemeral key from JWK format
   * Converts the transmitted JSON Web Key back to usable key material
   */
  async importKey(keyData) {
    try {
      // JWK 'k' parameter contains the base64url-encoded key
      if (!keyData.k) {
        throw new Error('Invalid JWK format - missing key material');
      }

      // Convert base64url to base64
      const base64 = keyData.k.replace(/-/g, '+').replace(/_/g, '/');

      // Pad if necessary
      const padding = '='.repeat((4 - (base64.length % 4)) % 4);
      const keyBuffer = Buffer.from(base64 + padding, 'base64');

      // For AES-256, we need exactly 32 bytes
      if (keyBuffer.length !== 32) {
        throw new Error(`Invalid key length: expected 32 bytes, got ${keyBuffer.length}`);
      }

      return keyBuffer;
    } catch (error) {
      console.error('Key import failed:', error);
      throw new Error('Failed to import ephemeral key: ' + error.message);
    }
  }

  /**
   * Validate email format - ensure proper form
   */
  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Log encryption metrics for monitoring
   */
  logMetrics(securePackage) {
    const age = Date.now() - securePackage.timestamp;
    console.log('📊 Encryption Metrics:', {
      age_ms: age,
      age_seconds: (age / 1000).toFixed(2),
      timestamp: new Date(securePackage.timestamp).toISOString(),
      processed_at: new Date().toISOString()
    });
  }
}

module.exports = { GuptaVidyaDecryption };
