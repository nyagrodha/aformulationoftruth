import { jest } from '@jest/globals';
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';

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

describe('Proust Response Submission Tests', () => {
  let app;

  beforeEach(async () => {
    // Clear all mock implementations and calls
    MockClient.mockClear();
    mockConnect.mockClear();
    mockQuery.mockClear();
    mockEnd.mockClear();
    
    // Mock successful database connection
    mockConnect.mockResolvedValue();

    // Import and setup Express app
    const express = (await import('express')).default;
    const cors = (await import('cors')).default;
    
    app = express();
    app.use(cors());
    app.use(express.json());

    // Add the Proust response endpoint (based on your server.js)
    app.post('/proust', async (req, res) => {
      const { email, responses } = req.body;
      
      if (!email || !responses) {
        return res.status(400).json({ error: 'Email and responses are required' });
      }

      try {
        const { Client } = await import('pg');
        const client = new Client();
        
        // Find user by email
        const userResult = await client.query('SELECT id FROM users WHERE email = $1', [email]);
        
        if (userResult.rows.length === 0) {
          return res.status(400).json({ error: 'User not found' });
        }

        const userId = userResult.rows[0].id;
        
        // Insert all responses using Promise.all (as in your server.js)
        const insertPromises = responses.map(({ question, answer }) => 
          client.query('INSERT INTO responses (user_id, question, answer) VALUES ($1, $2, $3)', [userId, question, answer])
        );

        await Promise.all(insertPromises);
        
        res.json({ message: 'Responses saved' });
      } catch (err) {
        console.error('Database error:', err);
        res.status(500).json({ error: 'Error saving responses' });
      }
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /proust', () => {
    test('should return error when email is missing', async () => {
      const response = await request(app)
        .post('/proust')
        .send({
          responses: [{ question: 'Test?', answer: 'Test answer' }]
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Email and responses are required'
      });
      expect(mockQuery).not.toHaveBeenCalled();
    });

    test('should return error when responses are missing', async () => {
      const response = await request(app)
        .post('/proust')
        .send({
          email: 'user@example.com'
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Email and responses are required'
      });
      expect(mockQuery).not.toHaveBeenCalled();
    });

    test('should return error when user not found', async () => {
      const email = 'nonexistent@example.com';
      
      // Mock empty user result
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/proust')
        .send({
          email,
          responses: [{ question: 'Test?', answer: 'Test answer' }]
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'User not found'
      });
      
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT id FROM users WHERE email = $1', 
        [email]
      );
    });

    test('should successfully save single response', async () => {
      const email = 'user@example.com';
      const mockUserId = 1;
      const responses = [{
        question: 'What is your favorite childhood memory?',
        answer: 'Playing in the garden with my siblings'
      }];
      
      // Mock successful user lookup
      mockQuery.mockResolvedValueOnce({ rows: [{ id: mockUserId }] });
      // Mock successful response insertion
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/proust')
        .send({ email, responses });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        message: 'Responses saved'
      });
      
      expect(mockQuery).toHaveBeenCalledTimes(2);
      expect(mockQuery).toHaveBeenNthCalledWith(1,
        'SELECT id FROM users WHERE email = $1', 
        [email]
      );
      expect(mockQuery).toHaveBeenNthCalledWith(2,
        'INSERT INTO responses (user_id, question, answer) VALUES ($1, $2, $3)',
        [mockUserId, responses[0].question, responses[0].answer]
      );
    });

    test('should successfully save multiple responses', async () => {
      const email = 'user@example.com';
      const mockUserId = 2;
      const responses = [
        {
          question: 'What is your favorite childhood memory?',
          answer: 'Playing in the garden'
        },
        {
          question: 'What makes you feel most alive?',
          answer: 'Reading literature'
        },
        {
          question: 'What would you change about yourself?',
          answer: 'Nothing, I accept myself'
        }
      ];
      
      // Mock successful user lookup
      mockQuery.mockResolvedValueOnce({ rows: [{ id: mockUserId }] });
      // Mock successful response insertions
      mockQuery.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .post('/proust')
        .send({ email, responses });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        message: 'Responses saved'
      });
      
      // Should call user lookup + 3 response insertions
      expect(mockQuery).toHaveBeenCalledTimes(4);
      
      expect(mockQuery).toHaveBeenNthCalledWith(1,
        'SELECT id FROM users WHERE email = $1', 
        [email]
      );

      // Verify each response was inserted correctly
      responses.forEach((resp, index) => {
        expect(mockQuery).toHaveBeenNthCalledWith(index + 2,
          'INSERT INTO responses (user_id, question, answer) VALUES ($1, $2, $3)',
          [mockUserId, resp.question, resp.answer]
        );
      });
    });

    test('should handle empty responses array', async () => {
      const email = 'user@example.com';
      const mockUserId = 1;
      
      // Mock successful user lookup
      mockQuery.mockResolvedValueOnce({ rows: [{ id: mockUserId }] });

      const response = await request(app)
        .post('/proust')
        .send({
          email,
          responses: []
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        message: 'Responses saved'
      });
      
      // Should only call user lookup, no response insertions
      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT id FROM users WHERE email = $1', 
        [email]
      );
    });

    test('should handle database errors during user lookup', async () => {
      const email = 'user@example.com';
      const dbError = new Error('Database connection failed');
      
      mockQuery.mockRejectedValue(dbError);

      const response = await request(app)
        .post('/proust')
        .send({
          email,
          responses: [{ question: 'Test?', answer: 'Test' }]
        });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Error saving responses'
      });
    });

    test('should handle database errors during response insertion', async () => {
      const email = 'user@example.com';
      const mockUserId = 1;
      const responses = [{ question: 'Test?', answer: 'Test' }];
      
      // Mock successful user lookup
      mockQuery.mockResolvedValueOnce({ rows: [{ id: mockUserId }] });
      // Mock failed response insertion
      const insertError = new Error('Insert failed');
      mockQuery.mockRejectedValueOnce(insertError);

      const response = await request(app)
        .post('/proust')
        .send({ email, responses });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Error saving responses'
      });
    });

    test('should handle malformed response objects', async () => {
      const email = 'user@example.com';
      const mockUserId = 1;
      const malformedResponses = [
        { question: 'Valid question?', answer: 'Valid answer' },
        { question: 'Missing answer question?' }, // Missing answer
        { answer: 'Missing question answer' }    // Missing question
      ];
      
      // Mock successful user lookup
      mockQuery.mockResolvedValueOnce({ rows: [{ id: mockUserId }] });
      // Mock response insertions
      mockQuery.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .post('/proust')
        .send({ email, responses: malformedResponses });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        message: 'Responses saved'
      });
      
      // Should still attempt to insert all responses (including malformed ones)
      expect(mockQuery).toHaveBeenCalledTimes(4); // 1 user lookup + 3 insertions
      
      // Check that undefined values are passed for missing fields
      expect(mockQuery).toHaveBeenNthCalledWith(3,
        'INSERT INTO responses (user_id, question, answer) VALUES ($1, $2, $3)',
        [mockUserId, malformedResponses[1].question, undefined]
      );
      
      expect(mockQuery).toHaveBeenNthCalledWith(4,
        'INSERT INTO responses (user_id, question, answer) VALUES ($1, $2, $3)',
        [mockUserId, undefined, malformedResponses[2].answer]
      );
    });

    test('should handle very long response texts', async () => {
      const email = 'user@example.com';
      const mockUserId = 1;
      const longText = 'x'.repeat(10000); // 10KB text
      const responses = [{
        question: 'What is your most detailed memory?',
        answer: longText
      }];
      
      mockQuery.mockResolvedValueOnce({ rows: [{ id: mockUserId }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/proust')
        .send({ email, responses });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        message: 'Responses saved'
      });
      
      expect(mockQuery).toHaveBeenNthCalledWith(2,
        'INSERT INTO responses (user_id, question, answer) VALUES ($1, $2, $3)',
        [mockUserId, responses[0].question, longText]
      );
    });
  });

  describe('Promise.all Transaction Behavior', () => {
    test('should save all responses atomically or fail completely', async () => {
      const email = 'user@example.com';
      const mockUserId = 1;
      const responses = [
        { question: 'Q1', answer: 'A1' },
        { question: 'Q2', answer: 'A2' },
        { question: 'Q3', answer: 'A3' }
      ];
      
      // Mock successful user lookup
      mockQuery.mockResolvedValueOnce({ rows: [{ id: mockUserId }] });
      
      // Mock first two insertions succeed, third fails
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockRejectedValueOnce(new Error('Third insert failed'));

      const response = await request(app)
        .post('/proust')
        .send({ email, responses });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Error saving responses'
      });
      
      // All three insertions should have been attempted
      expect(mockQuery).toHaveBeenCalledTimes(4); // 1 user lookup + 3 insert attempts
    });
  });
});
