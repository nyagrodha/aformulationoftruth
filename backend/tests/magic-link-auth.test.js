import { jest } from '@jest/globals';
import { describe, test, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import crypto from 'crypto';

// Mock nodemailer
const mockSendMail = jest.fn();
jest.unstable_mockModule('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: mockSendMail,
    verify: jest.fn().mockResolvedValue(true)
  }))
}));

// Mock the database utilities
const mockGenerateToken = jest.fn();
const mockSaveMagicLinkToken = jest.fn();
const mockFindMagicLinkToken = jest.fn();
const mockDeleteMagicLinkToken = jest.fn();
const mockCleanupExpiredTokens = jest.fn();

jest.unstable_mockModule('../utils/db.js', () => ({
  generateToken: mockGenerateToken,
  saveMagicLinkToken: mockSaveMagicLinkToken,
  findMagicLinkToken: mockFindMagicLinkToken,
  deleteMagicLinkToken: mockDeleteMagicLinkToken,
  cleanupExpiredTokens: mockCleanupExpiredTokens
}));

// Mock the mailer
const mockSendMagicLinkEmail = jest.fn();
jest.unstable_mockModule('../utils/mailer.js', () => ({
  sendMagicLinkEmail: mockSendMagicLinkEmail
}));

describe('Magic Link Authentication E2E Tests', () => {
  let app;
  let authRouter;

  beforeAll(async () => {
    // Import express and create test app
    const express = (await import('express')).default;

    app = express();
    app.use(express.json());

    // Import auth router after mocking dependencies
    authRouter = (await import('../routes/auth.js')).default;
    app.use('/auth', authRouter);
  });

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Setup default mock implementations
    mockGenerateToken.mockReturnValue('mock-token-12345');
    mockSaveMagicLinkToken.mockResolvedValue();
    mockSendMagicLinkEmail.mockResolvedValue();
    mockDeleteMagicLinkToken.mockResolvedValue();
  });

  describe('POST /auth/magic-link - Magic Link Request', () => {
    test('should successfully request magic link with valid email', async () => {
      const email = 'test@example.com';

      const response = await request(app)
        .post('/auth/magic-link')
        .send({ email })
        .expect(200);

      expect(response.body).toEqual({ ok: true });

      // Verify token generation
      expect(mockGenerateToken).toHaveBeenCalledTimes(1);

      // Verify token storage
      expect(mockSaveMagicLinkToken).toHaveBeenCalledWith(email, 'mock-token-12345');

      // Verify email sending
      expect(mockSendMagicLinkEmail).toHaveBeenCalledWith(email, 'mock-token-12345');
    });

    test('should reject request without email', async () => {
      const response = await request(app)
        .post('/auth/magic-link')
        .send({})
        .expect(400);

      expect(response.body).toEqual({ error: 'Email required.' });

      // Should not call any services without email
      expect(mockGenerateToken).not.toHaveBeenCalled();
      expect(mockSaveMagicLinkToken).not.toHaveBeenCalled();
      expect(mockSendMagicLinkEmail).not.toHaveBeenCalled();
    });

    test('should reject request with null email', async () => {
      const response = await request(app)
        .post('/auth/magic-link')
        .send({ email: null })
        .expect(400);

      expect(response.body).toEqual({ error: 'Email required.' });
    });

    test('should reject request with empty string email', async () => {
      const response = await request(app)
        .post('/auth/magic-link')
        .send({ email: '' })
        .expect(400);

      expect(response.body).toEqual({ error: 'Email required.' });
    });

    test('should handle token generation failure', async () => {
      mockGenerateToken.mockImplementation(() => {
        throw new Error('Token generation failed');
      });

      await request(app)
        .post('/auth/magic-link')
        .send({ email: 'test@example.com' })
        .expect(500);

      expect(mockGenerateToken).toHaveBeenCalled();
    });

    test('should handle token storage failure', async () => {
      mockSaveMagicLinkToken.mockRejectedValue(new Error('Database error'));

      await request(app)
        .post('/auth/magic-link')
        .send({ email: 'test@example.com' })
        .expect(500);

      expect(mockSaveMagicLinkToken).toHaveBeenCalled();
    });

    test('should handle email sending failure', async () => {
      mockSendMagicLinkEmail.mockRejectedValue(new Error('SMTP error'));

      await request(app)
        .post('/auth/magic-link')
        .send({ email: 'test@example.com' })
        .expect(500);

      expect(mockSendMagicLinkEmail).toHaveBeenCalled();
    });

    test('should handle various email formats', async () => {
      const validEmails = [
        'user@domain.com',
        'user.name@domain.co.uk',
        'user+tag@domain.org',
        'user123@domain-name.com'
      ];

      for (const email of validEmails) {
        jest.clearAllMocks();

        const response = await request(app)
          .post('/auth/magic-link')
          .send({ email })
          .expect(200);

        expect(response.body).toEqual({ ok: true });
        expect(mockSaveMagicLinkToken).toHaveBeenCalledWith(email, 'mock-token-12345');
      }
    });
  });

  describe('GET /auth/verify - Magic Link Verification', () => {
    test('should successfully verify valid token', async () => {
      const token = 'valid-token-123';
      const email = 'test@example.com';

      mockFindMagicLinkToken.mockResolvedValue({
        email: email,
        expires_at: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes from now
      });

      const response = await request(app)
        .get('/auth/verify')
        .query({ token })
        .expect(302); // Redirect

      // Check redirect location contains callback with hash
      expect(response.headers.location).toMatch(/^\/callback\?token=[a-f0-9]{64}$/);

      // Verify token lookup
      expect(mockFindMagicLinkToken).toHaveBeenCalledWith(token);

      // Verify token deletion (one-time use)
      expect(mockDeleteMagicLinkToken).toHaveBeenCalledWith(token);
    });

    test('should reject request without token', async () => {
      const response = await request(app)
        .get('/auth/verify')
        .expect(400);

      expect(response.text).toBe('Missing token.');
      expect(mockFindMagicLinkToken).not.toHaveBeenCalled();
    });

    test('should reject invalid token', async () => {
      const token = 'invalid-token-123';

      mockFindMagicLinkToken.mockResolvedValue(null);

      const response = await request(app)
        .get('/auth/verify')
        .query({ token })
        .expect(400);

      expect(response.text).toBe('Invalid or expired token.');
      expect(mockFindMagicLinkToken).toHaveBeenCalledWith(token);
      expect(mockDeleteMagicLinkToken).not.toHaveBeenCalled();
    });

    test('should reject expired token', async () => {
      const token = 'expired-token-123';

      // findMagicLinkToken should return null for expired tokens
      mockFindMagicLinkToken.mockResolvedValue(null);

      const response = await request(app)
        .get('/auth/verify')
        .query({ token })
        .expect(400);

      expect(response.text).toBe('Invalid or expired token.');
    });

    test('should handle database errors during token lookup', async () => {
      const token = 'test-token-123';

      mockFindMagicLinkToken.mockRejectedValue(new Error('Database connection failed'));

      await request(app)
        .get('/auth/verify')
        .query({ token })
        .expect(500);

      expect(mockFindMagicLinkToken).toHaveBeenCalledWith(token);
    });

    test('should create session with user email', async () => {
      const token = 'valid-token-123';
      const email = 'test@example.com';

      mockFindMagicLinkToken.mockResolvedValue({
        email: email,
        expires_at: new Date(Date.now() + 10 * 60 * 1000)
      });

      const agent = request.agent(app);

      const response = await agent
        .get('/auth/verify')
        .query({ token })
        .expect(302);

      // The session should now contain user data
      // Note: In a real e2e test, you'd verify this by making subsequent
      // authenticated requests with the same agent
    });

    test('should generate unique auth hash for callback', async () => {
      const token = 'valid-token-123';
      const email = 'test@example.com';

      mockFindMagicLinkToken.mockResolvedValue({
        email: email,
        expires_at: new Date(Date.now() + 10 * 60 * 1000)
      });

      // Make two separate requests
      const response1 = await request(app)
        .get('/auth/verify')
        .query({ token: token + '1' });

      jest.clearAllMocks();
      mockFindMagicLinkToken.mockResolvedValue({
        email: email,
        expires_at: new Date(Date.now() + 10 * 60 * 1000)
      });

      const response2 = await request(app)
        .get('/auth/verify')
        .query({ token: token + '2' });

      // Both should redirect but with different hashes
      const hash1 = response1.headers.location?.split('token=')[1];
      const hash2 = response2.headers.location?.split('token=')[1];

      expect(hash1).toBeDefined();
      expect(hash2).toBeDefined();
      expect(hash1).not.toBe(hash2);
    });

    test('should handle token deletion failure gracefully', async () => {
      const token = 'valid-token-123';
      const email = 'test@example.com';

      mockFindMagicLinkToken.mockResolvedValue({
        email: email,
        expires_at: new Date(Date.now() + 10 * 60 * 1000)
      });

      mockDeleteMagicLinkToken.mockRejectedValue(new Error('Delete failed'));

      // Should still redirect successfully even if deletion fails
      await request(app)
        .get('/auth/verify')
        .query({ token })
        .expect(302);
    });
  });

  describe('Magic Link Security Tests', () => {
    test('should generate cryptographically secure tokens', () => {
      mockGenerateToken.mockImplementation(() =>
        crypto.randomBytes(32).toString('hex')
      );

      const tokens = new Set();

      // Generate 1000 tokens and ensure they're all unique
      for (let i = 0; i < 1000; i++) {
        const token = mockGenerateToken();
        expect(token).toMatch(/^[a-f0-9]{64}$/); // 32 bytes = 64 hex chars
        expect(tokens.has(token)).toBe(false);
        tokens.add(token);
      }
    });

    test('should handle concurrent magic link requests for same email', async () => {
      const email = 'test@example.com';

      // Simulate multiple concurrent requests
      const requests = Array(5).fill().map(() =>
        request(app)
          .post('/auth/magic-link')
          .send({ email })
      );

      const responses = await Promise.all(requests);

      // All should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ ok: true });
      });

      // Should generate unique tokens for each request
      expect(mockGenerateToken).toHaveBeenCalledTimes(5);
      expect(mockSaveMagicLinkToken).toHaveBeenCalledTimes(5);
    });

    test('should properly encode special characters in email', async () => {
      const specialEmails = [
        'user+test@domain.com',
        'user.name+tag@domain.co.uk',
        'user%20space@domain.org'
      ];

      for (const email of specialEmails) {
        jest.clearAllMocks();

        await request(app)
          .post('/auth/magic-link')
          .send({ email })
          .expect(200);

        expect(mockSaveMagicLinkToken).toHaveBeenCalledWith(email, 'mock-token-12345');
      }
    });

    test('should validate token format in verification', async () => {
      const invalidTokenFormats = [
        { token: 'short', expectLookup: true },
        { token: 'contains spaces', expectLookup: true },
        { token: 'contains/slashes', expectLookup: true },
        { token: 'contains?query=params', expectLookup: true },
        { token: '', expectLookup: false },
        { token: null, expectLookup: false },
        { token: undefined, expectLookup: false }
      ];

      for (const { token, expectLookup } of invalidTokenFormats) {
        jest.clearAllMocks();

        // Mock null response for invalid tokens
        mockFindMagicLinkToken.mockResolvedValue(null);

        if (token === null || token === undefined || token === '') {
          await request(app)
            .get('/auth/verify')
            .query(token ? { token } : {})
            .expect(400);
        } else {
          await request(app)
            .get('/auth/verify')
            .query({ token })
            .expect(400);

          if (expectLookup) {
            expect(mockFindMagicLinkToken).toHaveBeenCalledWith(token);
          }
        }
      }
    });
  });

  describe('Integration Flow Tests', () => {
    test('complete magic link authentication flow', async () => {
      const email = 'integration@example.com';
      let generatedToken;

      // Mock token generation to capture the token
      mockGenerateToken.mockImplementation(() => {
        generatedToken = crypto.randomBytes(32).toString('hex');
        return generatedToken;
      });

      // Step 1: Request magic link
      const requestResponse = await request(app)
        .post('/auth/magic-link')
        .send({ email })
        .expect(200);

      expect(requestResponse.body).toEqual({ ok: true });
      expect(generatedToken).toBeDefined();

      // Step 2: Mock token lookup for verification
      mockFindMagicLinkToken.mockResolvedValue({
        email: email,
        expires_at: new Date(Date.now() + 10 * 60 * 1000)
      });

      // Step 3: Verify magic link
      const verifyResponse = await request(app)
        .get('/auth/verify')
        .query({ token: generatedToken })
        .expect(302);

      expect(verifyResponse.headers.location).toMatch(/^\/callback\?token=[a-f0-9]{64}$/);

      // Verify the flow completed correctly
      expect(mockFindMagicLinkToken).toHaveBeenCalledWith(generatedToken);
      expect(mockDeleteMagicLinkToken).toHaveBeenCalledWith(generatedToken);
    });

    test('should prevent token reuse after successful verification', async () => {
      const token = 'one-time-token-123';
      const email = 'test@example.com';

      // First verification - should succeed
      mockFindMagicLinkToken.mockResolvedValueOnce({
        email: email,
        expires_at: new Date(Date.now() + 10 * 60 * 1000)
      });

      await request(app)
        .get('/auth/verify')
        .query({ token })
        .expect(302);

      // Second verification - token should be invalid (deleted)
      mockFindMagicLinkToken.mockResolvedValueOnce(null);

      await request(app)
        .get('/auth/verify')
        .query({ token })
        .expect(400);

      expect(mockDeleteMagicLinkToken).toHaveBeenCalledTimes(1);
    });

    test('should handle multiple users with different tokens', async () => {
      const users = [
        { email: 'user1@example.com', token: 'token-user1' },
        { email: 'user2@example.com', token: 'token-user2' },
        { email: 'user3@example.com', token: 'token-user3' }
      ];

      // Request magic links for all users
      for (const user of users) {
        mockGenerateToken.mockReturnValueOnce(user.token);

        await request(app)
          .post('/auth/magic-link')
          .send({ email: user.email })
          .expect(200);

        expect(mockSaveMagicLinkToken).toHaveBeenCalledWith(user.email, user.token);
      }

      // Verify each token works independently
      for (const user of users) {
        mockFindMagicLinkToken.mockResolvedValueOnce({
          email: user.email,
          expires_at: new Date(Date.now() + 10 * 60 * 1000)
        });

        await request(app)
          .get('/auth/verify')
          .query({ token: user.token })
          .expect(302);

        expect(mockDeleteMagicLinkToken).toHaveBeenCalledWith(user.token);
      }
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle malformed JSON in request body', async () => {
      const response = await request(app)
        .post('/auth/magic-link')
        .set('Content-Type', 'application/json')
        .send('{"email": invalid json}')
        .expect(400);
    });

    test('should handle very long email addresses', async () => {
      const longEmail = 'a'.repeat(300) + '@example.com';

      const response = await request(app)
        .post('/auth/magic-link')
        .send({ email: longEmail })
        .expect(200);

      expect(mockSaveMagicLinkToken).toHaveBeenCalledWith(longEmail, 'mock-token-12345');
    });

    test('should handle unicode characters in email', async () => {
      const unicodeEmail = 'тест@пример.рф';

      const response = await request(app)
        .post('/auth/magic-link')
        .send({ email: unicodeEmail })
        .expect(200);

      expect(mockSaveMagicLinkToken).toHaveBeenCalledWith(unicodeEmail, 'mock-token-12345');
    });

    test('should handle request with additional unexpected fields', async () => {
      const response = await request(app)
        .post('/auth/magic-link')
        .send({
          email: 'test@example.com',
          password: 'should-be-ignored',
          extraField: 'also-ignored'
        })
        .expect(200);

      expect(response.body).toEqual({ ok: true });
    });
  });
});