// tests/encryption.test.js
// Tests for email encryption/decryption utilities
import { describe, test, expect, beforeAll } from '@jest/globals';
import { encryptEmail, decryptEmail, validateEmail, generateEncryptionKey } from '../utils/encryption.js';

// Set up test environment
beforeAll(() => {
  // Use a test encryption key if not set
  if (!process.env.EMAIL_ENCRYPTION_KEY) {
    process.env.EMAIL_ENCRYPTION_KEY = 'test-encryption-key-minimum-32-characters-long-for-security';
  }
});

describe('Email Encryption', () => {
  const testEmail = 'test@example.com';

  test('should encrypt an email address', () => {
    const encrypted = encryptEmail(testEmail);
    expect(encrypted).toBeDefined();
    expect(typeof encrypted).toBe('string');
    expect(encrypted).not.toBe(testEmail);
    expect(encrypted.length).toBeGreaterThan(0);
  });

  test('should produce different encrypted values for same email on multiple calls', () => {
    const encrypted1 = encryptEmail(testEmail);
    const encrypted2 = encryptEmail(testEmail);

    // Due to random salt and IV, each encryption should be different
    expect(encrypted1).not.toBe(encrypted2);
  });

  test('should throw error if EMAIL_ENCRYPTION_KEY is not set', () => {
    const originalKey = process.env.EMAIL_ENCRYPTION_KEY;
    delete process.env.EMAIL_ENCRYPTION_KEY;

    expect(() => {
      encryptEmail(testEmail);
    }).toThrow('EMAIL_ENCRYPTION_KEY environment variable not set');

    process.env.EMAIL_ENCRYPTION_KEY = originalKey;
  });

  test('should throw error if EMAIL_ENCRYPTION_KEY is too short', () => {
    const originalKey = process.env.EMAIL_ENCRYPTION_KEY;
    process.env.EMAIL_ENCRYPTION_KEY = 'short';

    expect(() => {
      encryptEmail(testEmail);
    }).toThrow('EMAIL_ENCRYPTION_KEY must be at least 32 characters long');

    process.env.EMAIL_ENCRYPTION_KEY = originalKey;
  });

  test('should handle special characters in email', () => {
    const specialEmail = 'test+tag@sub-domain.example.com';
    const encrypted = encryptEmail(specialEmail);
    expect(encrypted).toBeDefined();
    expect(typeof encrypted).toBe('string');
  });

  test('should handle long email addresses', () => {
    const longEmail = 'very.long.email.address.with.many.parts@subdomain.example.com';
    const encrypted = encryptEmail(longEmail);
    expect(encrypted).toBeDefined();
  });
});

describe('Email Decryption', () => {
  const testEmail = 'decrypt-test@example.com';

  test('should decrypt an encrypted email correctly', () => {
    const encrypted = encryptEmail(testEmail);
    const decrypted = decryptEmail(encrypted);
    expect(decrypted).toBe(testEmail);
  });

  test('should handle multiple encrypt/decrypt cycles', () => {
    let email = testEmail;
    for (let i = 0; i < 5; i++) {
      const encrypted = encryptEmail(email);
      const decrypted = decryptEmail(encrypted);
      expect(decrypted).toBe(testEmail);
    }
  });

  test('should throw error for invalid encrypted data', () => {
    expect(() => {
      decryptEmail('invalid-base64-data');
    }).toThrow();
  });

  test('should throw error for corrupted encrypted data', () => {
    const encrypted = encryptEmail(testEmail);
    const corrupted = encrypted.slice(0, -5) + 'XXXXX';

    expect(() => {
      decryptEmail(corrupted);
    }).toThrow();
  });

  test('should throw error when using wrong encryption key', () => {
    const encrypted = encryptEmail(testEmail);

    // Change the key
    const originalKey = process.env.EMAIL_ENCRYPTION_KEY;
    process.env.EMAIL_ENCRYPTION_KEY = 'different-encryption-key-for-testing-purposes-min-32-chars';

    expect(() => {
      decryptEmail(encrypted);
    }).toThrow();

    // Restore original key
    process.env.EMAIL_ENCRYPTION_KEY = originalKey;
  });

  test('should handle special characters in decryption', () => {
    const specialEmail = 'test+filter@sub-domain.example.co.uk';
    const encrypted = encryptEmail(specialEmail);
    const decrypted = decryptEmail(encrypted);
    expect(decrypted).toBe(specialEmail);
  });

  test('should preserve email case sensitivity', () => {
    const mixedCaseEmail = 'Test.User@Example.COM';
    const encrypted = encryptEmail(mixedCaseEmail);
    const decrypted = decryptEmail(encrypted);
    expect(decrypted).toBe(mixedCaseEmail);
  });
});

describe('Email Validation', () => {
  test('should validate correct email addresses', () => {
    expect(validateEmail('test@example.com')).toBe(true);
    expect(validateEmail('user.name@example.com')).toBe(true);
    expect(validateEmail('user+tag@example.co.uk')).toBe(true);
    expect(validateEmail('user_name@sub.example.com')).toBe(true);
  });

  test('should reject invalid email addresses', () => {
    expect(validateEmail('invalid')).toBe(false);
    expect(validateEmail('invalid@')).toBe(false);
    expect(validateEmail('@example.com')).toBe(false);
    expect(validateEmail('user@')).toBe(false);
    expect(validateEmail('user @example.com')).toBe(false);
    expect(validateEmail('user@example')).toBe(false);
    expect(validateEmail('')).toBe(false);
  });

  test('should reject emails with multiple @ symbols', () => {
    expect(validateEmail('user@@example.com')).toBe(false);
    expect(validateEmail('user@exam@ple.com')).toBe(false);
  });
});

describe('Encryption Key Generation', () => {
  test('should generate a valid encryption key', () => {
    const key = generateEncryptionKey();
    expect(key).toBeDefined();
    expect(typeof key).toBe('string');
    expect(key.length).toBe(64); // 32 bytes in hex = 64 characters
  });

  test('should generate unique keys each time', () => {
    const key1 = generateEncryptionKey();
    const key2 = generateEncryptionKey();
    expect(key1).not.toBe(key2);
  });

  test('should generate keys that work for encryption', () => {
    const newKey = generateEncryptionKey();
    const originalKey = process.env.EMAIL_ENCRYPTION_KEY;

    // Test that the generated key works
    process.env.EMAIL_ENCRYPTION_KEY = newKey;

    const testEmail = 'key-test@example.com';
    const encrypted = encryptEmail(testEmail);
    const decrypted = decryptEmail(encrypted);

    expect(decrypted).toBe(testEmail);

    // Restore original key
    process.env.EMAIL_ENCRYPTION_KEY = originalKey;
  });
});

describe('End-to-End Encryption Flow', () => {
  test('should handle complete encryption workflow', () => {
    const emails = [
      'user1@example.com',
      'user2@test.org',
      'admin@company.co.uk'
    ];

    // Encrypt all emails
    const encrypted = emails.map(email => ({
      original: email,
      encrypted: encryptEmail(email)
    }));

    // Verify all encrypted values are different
    const encryptedValues = encrypted.map(e => e.encrypted);
    const uniqueValues = new Set(encryptedValues);
    expect(uniqueValues.size).toBe(emails.length);

    // Decrypt and verify
    encrypted.forEach(({ original, encrypted }) => {
      const decrypted = decryptEmail(encrypted);
      expect(decrypted).toBe(original);
    });
  });

  test('should maintain data integrity across multiple operations', () => {
    const testEmail = 'integrity-test@example.com';
    const iterations = 10;

    for (let i = 0; i < iterations; i++) {
      const encrypted = encryptEmail(testEmail);
      const decrypted = decryptEmail(encrypted);
      expect(decrypted).toBe(testEmail);
    }
  });

  test('should handle concurrent encryption operations', async () => {
    const emails = Array.from({ length: 20 }, (_, i) => `user${i}@example.com`);

    const encryptPromises = emails.map(email =>
      Promise.resolve().then(() => ({
        original: email,
        encrypted: encryptEmail(email)
      }))
    );

    const results = await Promise.all(encryptPromises);

    // Verify all can be decrypted
    results.forEach(({ original, encrypted }) => {
      const decrypted = decryptEmail(encrypted);
      expect(decrypted).toBe(original);
    });
  });
});

describe('Security Properties', () => {
  test('encrypted data should not contain plaintext email', () => {
    const testEmail = 'security-test@example.com';
    const encrypted = encryptEmail(testEmail);

    // Convert to lowercase for case-insensitive search
    const encryptedLower = encrypted.toLowerCase();
    const emailParts = testEmail.toLowerCase().split('@');

    // Check that no part of the email appears in encrypted data
    emailParts.forEach(part => {
      expect(encryptedLower).not.toContain(part);
    });
  });

  test('encrypted data should be sufficiently long', () => {
    const testEmail = 'short@x.co';
    const encrypted = encryptEmail(testEmail);

    // Encrypted data should be much longer than original
    // Salt (32) + IV (16) + AuthTag (16) + encrypted data + base64 overhead
    expect(encrypted.length).toBeGreaterThanOrEqual(100);
  });

  test('should use proper base64 encoding', () => {
    const testEmail = 'encoding-test@example.com';
    const encrypted = encryptEmail(testEmail);

    // Valid base64 regex
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    expect(base64Regex.test(encrypted)).toBe(true);
  });
});
