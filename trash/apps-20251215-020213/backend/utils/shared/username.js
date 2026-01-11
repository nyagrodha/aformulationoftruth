/**
 * Username Generation Utilities
 *
 * Centralized username generation logic to avoid code duplication
 * across server.ts and routes/answers.ts
 */
import crypto from 'crypto';
/**
 * Generate a hashed username from an email address
 *
 * @param email - The user's email address
 * @param jwtSecret - The JWT secret used for hashing
 * @param options - Optional configuration for prefix and length
 * @returns A hashed username string
 *
 * @example
 * const username = generateHashedUsername('user@example.com', 'secret123');
 * // Returns: 'user_a1b2c3d4e5f6g7h8'
 */
export function generateHashedUsername(email, jwtSecret, options = {}) {
    const { prefix = 'user_', length = 16 } = options;
    if (!email || typeof email !== 'string') {
        throw new Error('Email is required and must be a string');
    }
    if (!jwtSecret || typeof jwtSecret !== 'string') {
        throw new Error('JWT secret is required and must be a string');
    }
    if (length < 8 || length > 64) {
        throw new Error('Username length must be between 8 and 64 characters');
    }
    const hash = crypto
        .createHmac('sha256', jwtSecret)
        .update(email.toLowerCase().trim())
        .digest('hex');
    return `${prefix}${hash.substring(0, length)}`;
}
/**
 * Validate if a username meets the required format
 *
 * @param username - The username to validate
 * @returns True if valid, false otherwise
 */
export function isValidUsername(username) {
    if (!username || typeof username !== 'string') {
        return false;
    }
    // Username should be alphanumeric with underscores, 3-64 characters
    const usernameRegex = /^[a-zA-Z0-9_]{3,64}$/;
    return usernameRegex.test(username);
}
/**
 * Generate a display name from an email address
 *
 * @param email - The user's email address
 * @returns A display name derived from the email
 *
 * @example
 * generateDisplayName('john.doe@example.com')
 * // Returns: 'john.doe'
 */
export function generateDisplayName(email) {
    if (!email || typeof email !== 'string') {
        throw new Error('Email is required and must be a string');
    }
    const localPart = email.split('@')[0];
    return localPart || 'user';
}
