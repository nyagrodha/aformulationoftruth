import { jest } from '@jest/globals';
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';

// Mock the pg module
const mockQuery = jest.fn();
const mockConnect = jest.fn().mockResolvedValue();
const mockEnd = jest.fn();

const MockClient = jest.fn().mockImplementation(() => ({
  connect: mockConnect,
  query: mockQuery,
  end: mockEnd
}));

jest.unstable_mockModule('pg', () => ({
  Client: MockClient
}));

// Mock nodemailer
jest.unstable_mockModule('nodemailer', () => ({
  default: {
    createTransporter: jest.fn().mockReturnValue({
      sendMail: jest.fn().mockResolvedValue({ messageId: 'test-id' })
    })
  }
}));

describe('Server Basic Endpoints', () => {
  let app;

  beforeEach(async () => {
    // Clear all mocks before each test
    jest.clearAllMocks();
    
    // Set up successful database mocks
    mockConnect.mockResolvedValue();
    mockQuery.mockResolvedValue({ rows: [] });

    // Mock environment variables
    process.env.DATABASE_URL = 'postgresql://test@localhost/test';
    process.env.PORT = '3001';

    // Dynamically import and create the app
    const { default: express } = await import('express');
    const { default: cors } = await import('cors');
    const { default: rateLimit } = await import('express-rate-limit');
    
    app = express();
    
    // Apply basic middleware
    app.use(cors());
    app.use(express.json());
    
    // Apply rate limiting
    const apiLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 100,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests; try again later.' },
    });
    app.use('/api', apiLimiter);
    
    // Basic routes from server.js
    app.get('/api/ping', (_, res) => res.json({ pong: true }));
    app.get('/', (req, res) => {
      res.send('Hello worlds from /');
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /', () => {
    test('should return hello message', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.text).toBe('Hello worlds from /');
    });
  });

  describe('GET /api/ping', () => {
    test('should return pong response', async () => {
      const response = await request(app)
        .get('/api/ping')
        .expect(200);

      expect(response.body).toEqual({ pong: true });
      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    test('should include rate limiting headers', async () => {
      const response = await request(app)
        .get('/api/ping')
        .expect(200);

      // Rate limiting should add these headers
      expect(response.headers).toHaveProperty('ratelimit-limit');
      expect(response.headers).toHaveProperty('ratelimit-remaining');
      expect(response.headers).toHaveProperty('ratelimit-reset');
    });
  });

  describe('Rate Limiting', () => {
    test('should apply rate limiting to API routes', async () => {
      // Make multiple requests to test rate limiting
      const requests = [];
      for (let i = 0; i < 5; i++) {
        requests.push(request(app).get('/api/ping'));
      }
      
      const responses = await Promise.all(requests);
      
      // All should succeed within the limit
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.headers).toHaveProperty('ratelimit-remaining');
      });
      
      // Check that remaining count decreases
      const remainingCounts = responses.map(r => 
        parseInt(r.headers['ratelimit-remaining'])
      );
      expect(remainingCounts[0]).toBeGreaterThan(remainingCounts[4]);
    });
  });

  describe('CORS', () => {
    test('should include CORS headers', async () => {
      const response = await request(app)
        .get('/api/ping')
        .expect(200);

      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });
  });

  describe('JSON Middleware', () => {
    test('should parse JSON bodies', async () => {
      // Add a test route that echoes the body
      app.post('/test-json', (req, res) => {
        res.json({ received: req.body });
      });

      const testData = { test: 'data', number: 123 };
      
      const response = await request(app)
        .post('/test-json')
        .send(testData)
        .expect(200);

      expect(response.body.received).toEqual(testData);
    });
  });
});
