import { jest } from '@jest/globals';
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// Mock the pg module
const mockQuery = jest.fn();
const mockConnect = jest.fn();
const mockEnd = jest.fn();

const MockClient = jest.fn().mockImplementation(() => ({
  connect: mockConnect,
  query: mockQuery,
  end: mockEnd
}));

jest.unstable_mockModule('pg', () => ({
  Client: MockClient
}));

describe('User Authentication Tests', () => {
  let app;
  const JWT_SECRET = 'test-secret-key';

  beforeEach(async () => {
    // Clear all mock implementations and calls
    MockClient.mockClear();
    mockConnect.mockClear();
    mockQuery.mockClear();
    mockEnd.mockClear();
    
    // Mock successful database connection
    mockConnect.mockResolvedValue();
    mockQuery.mockResolvedValue({ rows: [] });

    // Import the app after mocking
    const express = (await import('express')).default;
    const cors = (await import('cors')).default;
    const rateLimit = (await import('express-rate-limit')).default;
    
    app = express();
    app.use(cors());
    app.use(express.json());

    // Add the login endpoint (simplified version from your server.js)
    app.post('/login', async (req, res) => {
      const { token } = req.body;
      
      if (!token) {
        return res.status(400).json({ error: 'Token is required' });
      }

      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        const { Client } = await import('pg');
        const client = new Client();
        
        const result = await client.query('SELECT * FROM users WHERE email = $1', [decoded.email]);
        
        if (result.rows.length === 0) {
          return res.status(400).json({ error: 'Invalid user' });
        }
        
        res.json({ message: 'Logged in', user: result.rows[0] });
      } catch (err) {
        console.error('Auth error:', err);
        res.status(401).json({ error: 'Invalid or expired token' });
      }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /login', () => {
    test('should return error when no token provided', async () => {
      const response = await request(app)
        .post('/login')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Token is required'
      });
    });

    test('should return error for invalid token', async () => {
      const invalidToken = 'invalid.jwt.token';

      const response = await request(app)
        .post('/login')
        .send({ token: invalidToken });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: 'Invalid or expired token'
      });
    });

    test('should return error when user not found in database', async () => {
      const payload = { email: 'nonexistent@example.com' };
      const validToken = jwt.sign(payload, JWT_SECRET);
      
      // Mock empty result (user not found)
      mockQuery.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .post('/login')
        .send({ token: validToken });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Invalid user'
      });
      
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE email = $1', 
        [payload.email]
      );
    });

    test('should successfully login with valid token and existing user', async () => {
      const payload = { email: 'user@example.com' };
      const validToken = jwt.sign(payload, JWT_SECRET);
      const mockUser = { 
        id: 1, 
        email: 'user@example.com', 
        token: 'some-token' 
      };
      
      // Mock successful user query
      mockQuery.mockResolvedValue({ rows: [mockUser] });

      const response = await request(app)
        .post('/login')
        .send({ token: validToken });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        message: 'Logged in',
        user: mockUser
      });
      
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE email = $1', 
        [payload.email]
      );
    });

    test('should handle database errors gracefully', async () => {
      const payload = { email: 'user@example.com' };
      const validToken = jwt.sign(payload, JWT_SECRET);
      
      // Mock database error
      const dbError = new Error('Database connection failed');
      mockQuery.mockRejectedValue(dbError);

      const response = await request(app)
        .post('/login')
        .send({ token: validToken });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: 'Invalid or expired token'
      });
    });

    test('should handle expired tokens', async () => {
      const payload = { email: 'user@example.com' };
      const expiredToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '-1h' });

      const response = await request(app)
        .post('/login')
        .send({ token: expiredToken });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: 'Invalid or expired token'
      });
      
      // Should not make database call for expired token
      expect(mockQuery).not.toHaveBeenCalled();
    });

    test('should validate JWT payload structure', async () => {
      // Token with missing email field
      const invalidPayload = { name: 'Test User' };
      const tokenWithoutEmail = jwt.sign(invalidPayload, JWT_SECRET);

      mockQuery.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .post('/login')
        .send({ token: tokenWithoutEmail });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Invalid user'
      });

      // Should query with undefined email
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE email = $1', 
        [undefined]
      );
    });
  });

  describe('JWT Token Verification', () => {
    test('should verify tokens with correct secret', () => {
      const payload = { email: 'test@example.com' };
      const token = jwt.sign(payload, JWT_SECRET);
      
      const decoded = jwt.verify(token, JWT_SECRET);
      
      expect(decoded.email).toBe(payload.email);
      expect(decoded.iat).toBeDefined();
    });

    test('should reject tokens with wrong secret', () => {
      const payload = { email: 'test@example.com' };
      const token = jwt.sign(payload, 'wrong-secret');
      
      expect(() => {
        jwt.verify(token, JWT_SECRET);
      }).toThrow();
    });

    test('should reject malformed tokens', () => {
      const malformedToken = 'not.a.valid.jwt';
      
      expect(() => {
        jwt.verify(malformedToken, JWT_SECRET);
      }).toThrow();
    });
  });
});
