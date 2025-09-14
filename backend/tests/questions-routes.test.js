import { jest } from '@jest/globals';
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';

// Mock the pg module before importing anything that uses it
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

// Now import the app after mocking
const { default: express } = await import('express');
const { default: questionsRouter } = await import('../routes/questions.js');

describe('Questions Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/questions', questionsRouter);
    jest.clearAllMocks();
  });

  describe('GET /api/questions', () => {
    test('should return list of Proust questionnaire questions', async () => {
      const response = await request(app)
        .get('/api/questions')
        .expect(200);

      expect(response.body).toHaveProperty('questions');
      expect(Array.isArray(response.body.questions)).toBe(true);
      expect(response.body.questions).toHaveLength(35); // The expected number of Proust questions
      expect(response.body.questions[0]).toBe("What is your idea of perfect happiness?");
      expect(response.body.questions).toContain("What is your greatest fear?");
      expect(response.body.questions).toContain("What is your motto?");
    });

    test('should return Content-Type application/json', async () => {
      const response = await request(app)
        .get('/api/questions')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    test('should contain all expected Proust questions', async () => {
      const response = await request(app)
        .get('/api/questions')
        .expect(200);

      const questions = response.body.questions;
      
      // Test a few key questions to ensure they're all there
      const expectedQuestions = [
        "What is your idea of perfect happiness?",
        "What is your greatest fear?", 
        "Which living person do you most admire?",
        "What is your current state of mind?",
        "How would you like to die?",
        "What is your motto?"
      ];

      expectedQuestions.forEach(expectedQuestion => {
        expect(questions).toContain(expectedQuestion);
      });
    });
  });
});
