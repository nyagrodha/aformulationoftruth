/**
 * Response Encryption Service
 *
 * Provides per-response AES-256-GCM encryption for questionnaire answers.
 * Each response gets its own encryption unit (salt, IV, tag) to prevent
 * correlation attacks and limit blast radius of any key compromise.
 *
 * Security Properties:
 * - AES-256-GCM authenticated encryption
 * - Per-response random salt for key derivation
 * - 96-bit (12 byte) IV as recommended for GCM
 * - scrypt key derivation with hardened parameters
 * - Backward compatible with plaintext legacy responses
 */

import { encryptionService } from './encryptionService';

export interface EncryptedResponse {
  encryptedAnswer: string;  // base64 ciphertext
  iv: string;               // base64 IV
  tag: string;              // base64 auth tag
  salt: string;             // base64 salt
  encryptionType: 'server';
}

export interface PlaintextResponse {
  answer: string;
  encryptionType: 'plaintext';
}

export interface StoredResponse {
  answer: string;
  iv: string | null;
  tag: string | null;
  salt: string | null;
  encryptionType: string;
}

class ResponseEncryptionService {
  /**
   * Encrypt a plaintext answer for storage.
   * Returns the encrypted components ready for database insertion.
   */
  encryptAnswer(plaintext: string): EncryptedResponse {
    const encrypted = encryptionService.encrypt(plaintext);

    return {
      encryptedAnswer: encrypted.encrypted,
      iv: encrypted.iv,
      tag: encrypted.tag,
      salt: encrypted.salt,
      encryptionType: 'server'
    };
  }

  /**
   * Decrypt a stored response.
   * Handles both encrypted (server) and legacy plaintext responses.
   */
  decryptAnswer(stored: StoredResponse): string {
    // Check if this is a legacy plaintext response
    if (stored.encryptionType === 'plaintext' || !stored.iv || !stored.tag) {
      // Legacy plaintext - return as-is
      return stored.answer;
    }

    // Server-side encrypted response
    try {
      const decrypted = encryptionService.decrypt({
        encrypted: stored.answer,
        iv: stored.iv,
        tag: stored.tag,
        salt: stored.salt || undefined  // Handle responses before salt was added
      });
      return decrypted;
    } catch (error) {
      // If decryption fails, this might be legacy data or corrupted
      // Log for monitoring but don't expose details
      console.error('Response decryption failed for encryptionType:', stored.encryptionType);
      throw new Error('Failed to decrypt response');
    }
  }

  /**
   * Check if a stored response is encrypted.
   */
  isEncrypted(stored: StoredResponse): boolean {
    return stored.encryptionType === 'server' &&
           stored.iv !== null &&
           stored.tag !== null;
  }

  /**
   * Prepare response data for database insertion.
   * This is the main entry point for encrypting new responses.
   */
  prepareForStorage(plaintext: string): {
    answer: string;
    iv: string;
    tag: string;
    salt: string;
    encryptionType: 'server';
  } {
    const encrypted = this.encryptAnswer(plaintext);
    return {
      answer: encrypted.encryptedAnswer,
      iv: encrypted.iv,
      tag: encrypted.tag,
      salt: encrypted.salt,
      encryptionType: 'server'
    };
  }

  /**
   * Decrypt an array of stored responses.
   * Returns responses with decrypted 'answer' field.
   * Handles mixed encrypted and legacy plaintext responses.
   */
  decryptResponses<T extends StoredResponse>(responses: T[]): (T & { answer: string })[] {
    return responses.map(response => {
      try {
        const decryptedAnswer = this.decryptAnswer(response);
        return {
          ...response,
          answer: decryptedAnswer
        };
      } catch (error) {
        // Log error but don't fail entire batch
        console.error(`Failed to decrypt response id ${(response as any).id}:`, error);
        // Return with placeholder indicating decryption failure
        return {
          ...response,
          answer: '[Decryption failed]'
        };
      }
    });
  }

  /**
   * Decrypt a single response from database format.
   * Convenience wrapper for single response decryption.
   */
  decryptSingleResponse<T extends StoredResponse>(response: T): T & { answer: string } {
    const decryptedAnswer = this.decryptAnswer(response);
    return {
      ...response,
      answer: decryptedAnswer
    };
  }
}

export const responseEncryptionService = new ResponseEncryptionService();
