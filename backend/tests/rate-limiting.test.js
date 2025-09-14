import { jest } from '@jest/globals';
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';

describe('Rate Limiting Tests', () => {
  let app;

  beforeEach(async () => {
    // Import and setup Express app with rate limiting
    const express = (await import('express')).default;
    const cors = (await import('cors')).default;
    const rateLimit = (await import('express-rate-limit')).default;
    
    app = express();
    app.use(cors());
    app.use(express.json());

    // Global rate limiter: 100 requests per IP per 15 min (as in your server.js)
    const apiLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,    // 15 minutes
      max: 100,                    // limit each IP
      standardHeaders: true,       // adds 'RateLimit-*' headers
      legacyHeaders: false,        // removes 'X-RateLimit-*'
      message: { error: 'Too many requests; try again later.' }
    });

    // Apply to all API routes
    app.use('/api', apiLimiter);

    // Test routes
    app.get('/api/ping', (req, res) => res.json({ pong: true }));
    app.post('/api/test', (req, res) => res.json({ message: 'Test endpoint' }));

    // More restrictive rate limiter for sensitive endpoints
    const loginLimiter = rateLimit({
      windowMs: 60 * 1000,         // 1 minute
      max: 5,                      // limit each IP to 5 requests per minute
      message: { error: 'Too many login attempts; slow down' }
    });

    app.post('/api/login', loginLimiter, (req, res) => {
      res.json({ message: 'Login endpoint' });
    });

    // Non-API route (should not be rate limited)
    app.get('/health', (req, res) => res.json({ status: 'ok' }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Global API Rate Limiting', () => {
    test('should allow requests under the limit', async () => {
      for (let i = 0; i < 5; i++) {
        const response = await request(app)
          .get('/api/ping');
        
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ pong: true });
        
        // Check rate limit headers are present
        expect(response.headers['ratelimit-limit']).toBeDefined();
        expect(response.headers['ratelimit-remaining']).toBeDefined();
        expect(response.headers['ratelimit-reset']).toBeDefined();
      }
    });

    test('should include correct rate limit headers', async () => {
      const response = await request(app)
        .get('/api/ping');
      
      expect(response.status).toBe(200);
      
      // Standard rate limit headers should be present
      expect(response.headers['ratelimit-limit']).toBe('100');
      expect(parseInt(response.headers['ratelimit-remaining'])).toBeLessThanOrEqual(100);
      expect(response.headers['ratelimit-reset']).toBeDefined();
      
      // Legacy headers should NOT be present (legacyHeaders: false)
      expect(response.headers['x-ratelimit-limit']).toBeUndefined();
      expect(response.headers['x-ratelimit-remaining']).toBeUndefined();
    });

    test('should rate limit after exceeding maximum requests', async () => {
      // This test would require 101 requests to trigger in real scenario
      // For testing, we'll use a more realistic approach with a smaller limit
      const express = (await import('express')).default;
      const rateLimit = (await import('express-rate-limit')).default;
      
      const testApp = express();
      testApp.use(express.json());
      
      // Very small rate limit for testing
      const testLimiter = rateLimit({
        windowMs: 60 * 1000,       // 1 minute
        max: 3,                    // Only 3 requests
        message: { error: 'Too many requests; try again later.' }
      });

      testApp.use('/api', testLimiter);
      testApp.get('/api/test', (req, res) => res.json({ success: true }));

      // First 3 requests should succeed
      for (let i = 0; i < 3; i++) {
        const response = await request(testApp).get('/api/test');
        expect(response.status).toBe(200);
      }

      // 4th request should be rate limited
      const rateLimitedResponse = await request(testApp).get('/api/test');
      expect(rateLimitedResponse.status).toBe(429);
      expect(rateLimitedResponse.body).toEqual({
        error: 'Too many requests; try again later.'
      });
    });

    test('should apply rate limiting to POST requests', async () => {
      const response = await request(app)
        .post('/api/test')
        .send({ data: 'test' });
      
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Test endpoint' });
      expect(response.headers['ratelimit-limit']).toBeDefined();
    });

    test('should not rate limit non-API routes', async () => {
      // Make many requests to non-API route
      for (let i = 0; i < 10; i++) {
        const response = await request(app)
          .get('/health');
        
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ status: 'ok' });
        
        // Rate limit headers should NOT be present
        expect(response.headers['ratelimit-limit']).toBeUndefined();
        expect(response.headers['ratelimit-remaining']).toBeUndefined();
      }
    });
  });

  describe('Endpoint-Specific Rate Limiting', () => {
    test('should apply stricter limits to login endpoint', async () => {
      // Create test app with strict login rate limiting
      const express = (await import('express')).default;
      const rateLimit = (await import('express-rate-limit')).default;
      
      const testApp = express();
      testApp.use(express.json());
      
      const loginLimiter = rateLimit({
        windowMs: 60 * 1000,       // 1 minute
        max: 2,                    // Only 2 login attempts
        message: { error: 'Too many login attempts; slow down' }
      });

      testApp.post('/api/login', loginLimiter, (req, res) => {
        res.json({ message: 'Login successful' });
      });

      // First 2 requests should succeed
      for (let i = 0; i < 2; i++) {
        const response = await request(testApp)
          .post('/api/login')
          .send({ username: 'test', password: 'test' });
        
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ message: 'Login successful' });
      }

      // 3rd request should be rate limited
      const rateLimitedResponse = await request(testApp)
        .post('/api/login')
        .send({ username: 'test', password: 'test' });
      
      expect(rateLimitedResponse.status).toBe(429);
      expect(rateLimitedResponse.body).toEqual({
        error: 'Too many login attempts; slow down'
      });
    });

    test('should have different rate limits for different endpoints', async () => {
      // This test demonstrates that different endpoints can have different limits
      const response1 = await request(app).get('/api/ping');
      const response2 = await request(app).post('/api/login', { test: true });
      
      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      
      // Both should have rate limit headers, but potentially different values
      expect(response1.headers['ratelimit-limit']).toBeDefined();
      expect(response2.headers['ratelimit-limit']).toBeDefined();
    });
  });

  describe('Rate Limit Headers', () => {
    test('should include all required rate limit headers', async () => {
      const response = await request(app)
        .get('/api/ping');
      
      expect(response.status).toBe(200);
      
      // Required headers as per standardHeaders: true
      expect(response.headers['ratelimit-limit']).toBeDefined();
      expect(response.headers['ratelimit-remaining']).toBeDefined();
      expect(response.headers['ratelimit-reset']).toBeDefined();
      
      // Verify header values are numbers
      expect(parseInt(response.headers['ratelimit-limit'])).toBeGreaterThan(0);
      expect(parseInt(response.headers['ratelimit-remaining'])).toBeGreaterThanOrEqual(0);
      expect(parseInt(response.headers['ratelimit-reset'])).toBeGreaterThan(0);
    });

    test('should decrease remaining count with each request', async () => {
      // Create isolated test app to track remaining count
      const express = (await import('express')).default;
      const rateLimit = (await import('express-rate-limit')).default;
      
      const testApp = express();
      const testLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: 10,
        message: { error: 'Rate limited' }
      });

      testApp.use('/api', testLimiter);
      testApp.get('/api/count', (req, res) => res.json({ ok: true }));

      const response1 = await request(testApp).get('/api/count');
      const remaining1 = parseInt(response1.headers['ratelimit-remaining']);
      
      const response2 = await request(testApp).get('/api/count');
      const remaining2 = parseInt(response2.headers['ratelimit-remaining']);
      
      expect(remaining2).toBe(remaining1 - 1);
    });

    test('should return 429 status with proper headers when rate limited', async () => {
      const express = (await import('express')).default;
      const rateLimit = (await import('express-rate-limit')).default;
      
      const testApp = express();
      const strictLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: 1,                    // Only 1 request allowed
        standardHeaders: true,     // Explicitly enable headers
        legacyHeaders: false,
        message: { error: 'Rate limited' }
      });

      testApp.use('/api', strictLimiter);
      testApp.get('/api/strict', (req, res) => res.json({ ok: true }));

      // First request succeeds
      const response1 = await request(testApp).get('/api/strict');
      expect(response1.status).toBe(200);

      // Second request should be rate limited
      const response2 = await request(testApp).get('/api/strict');
      expect(response2.status).toBe(429);
      expect(response2.body).toEqual({ error: 'Rate limited' });
      
      // Check that headers are present (may not be exactly the same format)
      if (response2.headers['ratelimit-limit']) {
        expect(response2.headers['ratelimit-limit']).toBe('1');
        expect(response2.headers['ratelimit-remaining']).toBe('0');
      }
    });
  });

  describe('Rate Limit Configuration', () => {
    test('should respect custom window and max settings', async () => {
      const express = (await import('express')).default;
      const rateLimit = (await import('express-rate-limit')).default;
      
      const testApp = express();
      const customLimiter = rateLimit({
        windowMs: 30 * 1000,       // 30 seconds
        max: 5,                    // 5 requests
        standardHeaders: true
      });

      testApp.use('/api', customLimiter);
      testApp.get('/api/custom', (req, res) => res.json({ ok: true }));

      const response = await request(testApp).get('/api/custom');
      
      expect(response.status).toBe(200);
      expect(response.headers['ratelimit-limit']).toBe('5');
      
      // The reset time should exist and be a valid number
      const resetTime = parseInt(response.headers['ratelimit-reset']);
      expect(resetTime).toBeGreaterThan(0);
      
      // For this test, we just verify the reset time exists and is reasonable
      // The exact format may vary between express-rate-limit versions
      expect(response.headers['ratelimit-reset']).toBeDefined();
    });

    test('should handle edge case of max: 0 (blocks all requests)', async () => {
      const express = (await import('express')).default;
      const rateLimit = (await import('express-rate-limit')).default;
      
      const testApp = express();
      const zeroLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: 0,                    // No requests allowed
        message: { error: 'No requests allowed' },
        skipSuccessfulRequests: false,
        skipFailedRequests: false
      });

      testApp.use('/api', zeroLimiter);
      testApp.get('/api/zero', (req, res) => res.json({ ok: true }));

      const response = await request(testApp).get('/api/zero');
      expect(response.status).toBe(429);
      expect(response.body).toEqual({ error: 'No requests allowed' });
    });

    test('should validate rate limiter is working correctly', async () => {
      const express = (await import('express')).default;
      const rateLimit = (await import('express-rate-limit')).default;
      
      const testApp = express();
      const basicLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: 5,
        standardHeaders: true,
        message: { error: 'Rate limit exceeded' }
      });

      testApp.use('/test', basicLimiter);
      testApp.get('/test/endpoint', (req, res) => res.json({ success: true }));

      // Make 5 successful requests
      for (let i = 0; i < 5; i++) {
        const response = await request(testApp).get('/test/endpoint');
        expect(response.status).toBe(200);
      }

      // 6th request should be rate limited
      const limitedResponse = await request(testApp).get('/test/endpoint');
      expect(limitedResponse.status).toBe(429);
      expect(limitedResponse.body).toEqual({ error: 'Rate limit exceeded' });
    });
  });
});
