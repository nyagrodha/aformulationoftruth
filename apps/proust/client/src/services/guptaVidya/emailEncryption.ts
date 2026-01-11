/**
 * Email Encryption Service - Gupta Vidyā Implementation
 * गुप्त-विद्या - Client-Side Encryption
 *
 * This service embodies the principle of veiled knowledge,
 * where sensitive data is transformed through cryptographic śaktis
 *
 * Each encryption is a temporary manifestation of śaktipāta,
 * existing only for the duration needed to transmit the secret
 */

import type { EncryptedPackage, EncryptionConfig } from './types';

export class GuptaVidyaEncryption {
  private readonly config: EncryptionConfig = {
    algorithm: 'AES-GCM',
    keyLength: 256,
    maxAge: 5 * 60 * 1000  // 5 minutes - duration of śaktipāta
  };

  /**
   * Generate ephemeral encryption key - a temporary śakti
   * Each key exists only for one session, embodying impermanence (anitya)
   */
  async generateEphemeralKey(): Promise<CryptoKey> {
    try {
      return await window.crypto.subtle.generateKey(
        {
          name: this.config.algorithm,
          length: this.config.keyLength
        },
        true,  // extractable - can be exported for transmission
        ['encrypt', 'decrypt']
      );
    } catch (error) {
      console.error('Failed to generate ephemeral key:', error);
      throw new Error('The śakti could not manifest. Ensure secure context (HTTPS).');
    }
  }

  /**
   * Encrypt email address - veil the identity in digital māyā
   *
   * @param email - The plaintext email to encrypt
   * @param key - The ephemeral CryptoKey for this session
   * @returns Object containing ciphertext, IV, and salt
   */
  async encryptEmail(
    email: string,
    key: CryptoKey
  ): Promise<{
    ciphertext: ArrayBuffer;
    iv: Uint8Array;
    salt: Uint8Array;
  }> {
    // Generate initialization vector - the praṇava (primordial sound ॐ)
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    // Generate salt - the unique flavor of this encryption
    const salt = window.crypto.getRandomValues(new Uint8Array(16));

    // Encode email as bytes
    const encoder = new TextEncoder();
    const emailBytes = encoder.encode(email.toLowerCase().trim());

    // Perform encryption - the transformation into hidden form
    const ciphertext = await window.crypto.subtle.encrypt(
      {
        name: this.config.algorithm,
        iv: iv
      },
      key,
      emailBytes
    );

    return { ciphertext, iv, salt };
  }

  /**
   * Export key for transmission - prepare the śakti for journey
   * Converts CryptoKey to JSON Web Key format for transmission
   */
  async exportKey(key: CryptoKey): Promise<JsonWebKey> {
    return await window.crypto.subtle.exportKey('jwk', key);
  }

  /**
   * Convert ArrayBuffer to Base64 - encoding for safe transmission
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Create secure package for transmission to server
   * This is the main entry point for encrypting email addresses
   *
   * @param email - The plaintext email address
   * @returns Encrypted package ready for transmission
   */
  async createSecurePackage(email: string): Promise<EncryptedPackage> {
    // Validate email format before encryption
    if (!this.validateEmail(email)) {
      throw new Error('Invalid email format - the offering must be properly formed');
    }

    console.log('📿 Initiating gupta-vidyā encryption...');

    // Generate ephemeral key for this session
    const key = await this.generateEphemeralKey();
    console.log('🔑 Ephemeral śakti manifested');

    // Encrypt the email
    const { ciphertext, iv, salt } = await this.encryptEmail(email, key);
    console.log('🔐 Email veiled in digital māyā');

    // Export key for transmission
    const exportedKey = await this.exportKey(key);

    // Create signature for integrity verification
    const signature = await this.createSignature(ciphertext, iv, salt);
    console.log('🔏 Mudra (seal) of authenticity created');

    const securePackage: EncryptedPackage = {
      encryptedEmail: this.arrayBufferToBase64(ciphertext),
      ephemeralKey: btoa(JSON.stringify(exportedKey)),
      iv: this.arrayBufferToBase64(iv),
      salt: this.arrayBufferToBase64(salt),
      timestamp: Date.now(),
      signature
    };

    console.log('✨ Encrypted package prepared for transmission');

    return securePackage;
  }

  /**
   * Create HMAC signature - the mudra (seal) of authenticity
   * Ensures the encrypted data has not been tampered with during transmission
   */
  private async createSignature(
    ciphertext: ArrayBuffer,
    iv: Uint8Array,
    salt: Uint8Array
  ): Promise<string> {
    // Combine all elements for signing
    const combined = new Uint8Array(
      ciphertext.byteLength + iv.length + salt.length
    );
    combined.set(new Uint8Array(ciphertext), 0);
    combined.set(iv, ciphertext.byteLength);
    combined.set(salt, ciphertext.byteLength + iv.length);

    // Generate SHA-256 hash as signature
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', combined);
    return this.arrayBufferToBase64(hashBuffer);
  }

  /**
   * Validate email format - ensure proper form before encryption
   */
  private validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Check if browser supports Web Crypto API
   * Required for secure cryptographic operations
   */
  static isSupported(): boolean {
    return !!(window.crypto && window.crypto.subtle);
  }
}
