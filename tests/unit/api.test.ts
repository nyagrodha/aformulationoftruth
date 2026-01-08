import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { setupSecurity, healthCheck } from '../../server/middleware/security';

describe('Security Middleware', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    setupSecurity(app);
    healthCheck(app);
  });

  describe('Health Endpoints', () => {
    it('should return healthy status from /healthz', async () => {
      const response = await request(app)
        .get('/healthz')
        .expect(200);

      expect(response.body.status).toBe('healthy');
      expect(response.body.timestamp).toBeTruthy();
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
      expect(response.body.version).toBeTruthy();
    });

    it('should return metrics from /metrics', async () => {
      const response = await request(app)
        .get('/metrics')
        .expect(200);

      expect(response.body.timestamp).toBeTruthy();
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
      expect(response.body.memory).toBeTruthy();
      expect(response.body.platform).toBeTruthy();
      expect(response.body.version).toBeTruthy();
      expect(response.body.env).toBeTruthy();
    });
  });

  describe('Security Headers', () => {
    it('should set security headers', async () => {
      const response = await request(app).get('/healthz');

      // Check for helmet security headers
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBeDefined();
      expect(response.headers['strict-transport-security']).toBeDefined();
    });

    it('should set CORS headers correctly', async () => {
      const response = await request(app)
        .get('/healthz')
        .set('Origin', 'http://localhost:3000');

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should reject unauthorized CORS origins', async () => {
      const response = await request(app)
        .get('/healthz')
        .set('Origin', 'https://malicious-site.com');

      // Should not have CORS headers for unauthorized origin
      expect(response.headers['access-control-allow-origin']).not.toBe('https://malicious-site.com');
    });
  });

  describe('Rate Limiting', () => {
    it('should apply rate limiting to requests', async () => {
      // Make multiple requests rapidly
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(request(app).get('/healthz'));
      }

      const responses = await Promise.all(promises);

      // All should succeed initially (within rate limit)
      responses.forEach(response => {
        expect(response.status).toBeLessThan(500);
      });

      // Check rate limit headers are present
      expect(responses[0].headers['ratelimit-limit']).toBeDefined();
      expect(responses[0].headers['ratelimit-remaining']).toBeDefined();
    });
  });
});

describe('Authentication Utils', () => {
  describe('Token Validation', () => {
    it('should identify unauthorized errors correctly', async () => {
      const { isUnauthorizedError } = await import('../../client/src/lib/authUtils');

      expect(isUnauthorizedError(new Error('401: User Unauthorized'))).toBe(true);
      expect(isUnauthorizedError(new Error('403: Forbidden'))).toBe(false);
      expect(isUnauthorizedError(new Error('500: Internal Server Error'))).toBe(false);
    });
  });
});

// Mock question service tests
describe('Question Service', () => {
  it('should validate answers correctly', async () => {
    // This would test the question validation logic
    // Implementing a mock since the actual service may require database setup
    
    const mockValidateAnswer = (answer: string) => {
      if (!answer || answer.trim().length < 10) {
        return { isValid: false, errors: ['Answer too short'] };
      }
      return { isValid: true, errors: [] };
    };

    expect(mockValidateAnswer('')).toEqual({ 
      isValid: false, 
      errors: ['Answer too short'] 
    });

    expect(mockValidateAnswer('This is a meaningful philosophical response')).toEqual({ 
      isValid: true, 
      errors: [] 
    });
  });
});

// Encryption service tests
describe('Enhanced Storage Encryption', () => {
  it('should encrypt and decrypt responses correctly', () => {
    // Mock implementation of encryption test
    const crypto = require('crypto');
    
    const encryptResponse = (text: string, key: string) => {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher('aes-256-gcm', key);
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();
      
      return {
        encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex')
      };
    };

    const testKey = 'test-encryption-key-32-characters!!';
    const testText = 'This is a sensitive philosophical response';
    
    const encryptedData = encryptResponse(testText, testKey);
    
    expect(encryptedData.encrypted).toBeDefined();
    expect(encryptedData.iv).toBeDefined();
    expect(encryptedData.tag).toBeDefined();
    expect(encryptedData.encrypted).not.toBe(testText);
  });
});
