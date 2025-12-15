// Encryption utilities for user geolocation data
// Uses AES-256-GCM for authenticated encryption
// Each user's data is encrypted with a key derived from their access token
import crypto from 'crypto';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
/**
 * Derive encryption key from user's access token
 * @param token - User's JWT or session token
 * @returns Derived encryption key
 */
export function deriveKeyFromToken(token) {
    // Use PBKDF2 to derive a key from the token
    const salt = crypto.createHash('sha256').update(token).digest();
    return crypto.pbkdf2Sync(token, salt, 100000, KEY_LENGTH, 'sha256');
}
/**
 * Encrypt geolocation data
 * @param data - Geolocation object to encrypt
 * @param token - User's access token
 * @returns Encrypted data as base64 string with IV and auth tag
 */
export function encryptGeolocation(data, token) {
    try {
        const key = deriveKeyFromToken(token);
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
        const jsonData = JSON.stringify(data);
        let encrypted = cipher.update(jsonData, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();
        // Combine IV + encrypted data + auth tag
        const combined = Buffer.concat([
            iv,
            Buffer.from(encrypted, 'hex'),
            authTag
        ]);
        return combined.toString('base64');
    }
    catch (error) {
        console.error('Encryption failed:', error);
        throw new Error('Failed to encrypt geolocation data');
    }
}
/**
 * Decrypt geolocation data
 * @param encryptedData - Base64 encoded encrypted data
 * @param token - User's access token
 * @returns Decrypted geolocation object
 */
export function decryptGeolocation(encryptedData, token) {
    try {
        const key = deriveKeyFromToken(token);
        const combined = Buffer.from(encryptedData, 'base64');
        // Extract IV, encrypted data, and auth tag
        const iv = combined.subarray(0, IV_LENGTH);
        const authTag = combined.subarray(combined.length - TAG_LENGTH);
        const encrypted = combined.subarray(IV_LENGTH, combined.length - TAG_LENGTH);
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return JSON.parse(decrypted.toString('utf8'));
    }
    catch (error) {
        console.error('Decryption failed:', error);
        throw new Error('Failed to decrypt geolocation data');
    }
}
/**
 * Hash data for comparison without decryption
 * @param data - Data to hash
 * @returns SHA-256 hash as hex string
 */
export function hashData(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}
