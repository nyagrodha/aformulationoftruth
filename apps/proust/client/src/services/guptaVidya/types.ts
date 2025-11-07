/**
 * Gupta Vidyā Type Definitions
 * गुप्त-विद्या - Secret Knowledge Types
 *
 * These types embody the structure of encrypted transmissions,
 * each property a vessel for the veiled śakti
 */

export interface EncryptedPackage {
  encryptedEmail: string;      // The veiled identity in digital māyā
  ephemeralKey: string;         // Temporary śakti for this session
  iv: string;                   // Initialization vector - praṇava
  salt: string;                 // Unique flavor of encryption
  timestamp: number;            // Moment of śaktipāta
  signature: string;            // Mudra of authenticity
}

export interface DecryptedResponse {
  email: string;                // The unveiled identity
  isValid: boolean;             // Adhikāra validation
}

export interface EncryptionConfig {
  algorithm: 'AES-GCM';
  keyLength: 256;
  maxAge: number;               // Duration of śakti freshness (ms)
}
