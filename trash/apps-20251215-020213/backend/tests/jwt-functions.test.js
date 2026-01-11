import { jest } from '@jest/globals';
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import jwt from 'jsonwebtoken';

describe('JWT Token Functions', () => {
  const JWT_SECRET = 'test-secret-key';

  describe('Token Generation', () => {
    test('should generate valid JWT token for email', () => {
      const testEmail = 'test@example.com';
      
      function generateToken(email) {
        return jwt.sign({ email }, JWT_SECRET, { expiresIn: '15m' });
      }

      const token = generateToken(testEmail);
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts separated by dots
    });

    test('should generate tokens with correct payload', () => {
      const testEmail = 'user@domain.com';
      
      function generateToken(email) {
        return jwt.sign({ email }, JWT_SECRET, { expiresIn: '15m' });
      }

      const token = generateToken(testEmail);
      const decoded = jwt.verify(token, JWT_SECRET);
      
      expect(decoded.email).toBe(testEmail);
      expect(decoded.iat).toBeTruthy(); // issued at
      expect(decoded.exp).toBeTruthy(); // expiration
      expect(decoded.exp - decoded.iat).toBeCloseTo(15 * 60, 1); // ~15 minutes
    });

    test('should generate different tokens for same email at different times', async () => {
      const testEmail = 'test@example.com';
      
      function generateToken(email) {
        return jwt.sign({ email }, JWT_SECRET, { expiresIn: '15m' });
      }

      const token1 = generateToken(testEmail);
      
      // Wait a full second to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const token2 = generateToken(testEmail);
      
      expect(token1).not.toBe(token2);
      
      // But both should decode to same email
      const decoded1 = jwt.verify(token1, JWT_SECRET);
      const decoded2 = jwt.verify(token2, JWT_SECRET);
      expect(decoded1.email).toBe(decoded2.email);
    });
  });

  describe('Token Verification', () => {
    test('should verify valid token', () => {
      const testEmail = 'verify@example.com';
      const token = jwt.sign({ email: testEmail }, JWT_SECRET, { expiresIn: '15m' });
      
      const decoded = jwt.verify(token, JWT_SECRET);
      expect(decoded.email).toBe(testEmail);
    });

    test('should reject invalid token', () => {
      const invalidToken = 'not.a.valid.jwt.token';
      
      expect(() => {
        jwt.verify(invalidToken, JWT_SECRET);
      }).toThrow('jwt malformed'); // Corrected error message
    });

    test('should reject token with wrong secret', () => {
      const testEmail = 'test@example.com';
      const token = jwt.sign({ email: testEmail }, 'wrong-secret', { expiresIn: '15m' });
      
      expect(() => {
        jwt.verify(token, JWT_SECRET);
      }).toThrow('invalid signature');
    });

    test('should reject expired token', () => {
      const testEmail = 'expired@example.com';
      const expiredToken = jwt.sign({ email: testEmail }, JWT_SECRET, { expiresIn: '-1h' });
      
      expect(() => {
        jwt.verify(expiredToken, JWT_SECRET);
      }).toThrow('jwt expired');
    });

    test('should handle malformed tokens gracefully', () => {
      const malformedTokens = [
        '',
        'just-one-part',
        'two.parts',
        'three.parts.but.malformed'
      ];
      
      malformedTokens.forEach(token => {
        expect(() => {
          jwt.verify(token, JWT_SECRET);
        }).toThrow();
      });
    });

    test('should handle null and undefined tokens', () => {
      expect(() => {
        jwt.verify(null, JWT_SECRET);
      }).toThrow('jwt must be provided');
      
      expect(() => {
        jwt.verify(undefined, JWT_SECRET);
      }).toThrow('jwt must be provided');
    });
  });

  describe('Token Expiration', () => {
    test('should create token that expires in specified time', async () => {
      const testEmail = 'expiry@example.com';
      const shortToken = jwt.sign({ email: testEmail }, JWT_SECRET, { expiresIn: '2s' });
      
      // Should be valid immediately
      const decoded = jwt.verify(shortToken, JWT_SECRET);
      expect(decoded.email).toBe(testEmail);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Should now be expired
      expect(() => {
        jwt.verify(shortToken, JWT_SECRET);
      }).toThrow('jwt expired');
    });

    test('should handle various expiration formats', () => {
      const testEmail = 'formats@example.com';
      
      const formats = [
        '1h',
        '60m', 
        '3600s',
        3600, // seconds as number
      ];
      
      formats.forEach(expiry => {
        const token = jwt.sign({ email: testEmail }, JWT_SECRET, { expiresIn: expiry });
        const decoded = jwt.verify(token, JWT_SECRET);
        
        expect(decoded.email).toBe(testEmail);
        // All should expire in ~1 hour (3600 seconds)
        expect(decoded.exp - decoded.iat).toBeCloseTo(3600, 5);
      });
    });
  });

  describe('Magic Link URL Generation', () => {
    test('should create valid magic link URLs', () => {
      const testEmail = 'magic@example.com';
      const baseUrl = 'http://localhost:3000';
      
      function generateToken(email) {
        return jwt.sign({ email }, JWT_SECRET, { expiresIn: '15m' });
      }
      
      function createMagicLink(email, baseUrl) {
        const token = generateToken(email);
        return `${baseUrl}/auth/verify?token=${token}`;
      }
      
      const link = createMagicLink(testEmail, baseUrl);
      
      expect(link).toContain(baseUrl);
      expect(link).toContain('/auth/verify?token=');
      
      // Extract and verify token from URL
      const urlParams = new URLSearchParams(link.split('?')[1]);
      const token = urlParams.get('token');
      
      const decoded = jwt.verify(token, JWT_SECRET);
      expect(decoded.email).toBe(testEmail);
    });

    test('should handle URL encoding properly', () => {
      const testEmail = 'test+user@example.com'; // Email with + that needs encoding
      const baseUrl = 'https://app.example.com';
      
      function generateToken(email) {
        return jwt.sign({ email }, JWT_SECRET, { expiresIn: '15m' });
      }
      
      function createMagicLink(email, baseUrl) {
        const token = generateToken(email);
        return `${baseUrl}/auth/verify?token=${encodeURIComponent(token)}`;
      }
      
      const link = createMagicLink(testEmail, baseUrl);
      
      expect(link).toContain(baseUrl);
      expect(link).toContain('/auth/verify?token=');
      
      // Extract and decode token from URL
      const urlParams = new URLSearchParams(link.split('?')[1]);
      const token = urlParams.get('token');
      
      const decoded = jwt.verify(token, JWT_SECRET);
      expect(decoded.email).toBe(testEmail);
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty email', () => {
      function generateToken(email) {
        return jwt.sign({ email }, JWT_SECRET, { expiresIn: '15m' });
      }

      const token = generateToken('');
      const decoded = jwt.verify(token, JWT_SECRET);
      expect(decoded.email).toBe('');
    });

    test('should handle very long emails', () => {
      function generateToken(email) {
        return jwt.sign({ email }, JWT_SECRET, { expiresIn: '15m' });
      }

      const longEmail = 'a'.repeat(100) + '@' + 'b'.repeat(100) + '.com';
      const token = generateToken(longEmail);
      const decoded = jwt.verify(token, JWT_SECRET);
      expect(decoded.email).toBe(longEmail);
    });
  });
});
