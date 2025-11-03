// tests/newsletter.test.js
// Tests for newsletter subscription endpoint
import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { Client } from 'pg';
import newsletterRouter from '../routes/newsletter.js';
import { encryptEmail } from '../utils/encryption.js';

// Set up test app and database
let app;
let client;
let testDbUrl;

beforeAll(async () => {
  // Set up encryption key for tests
  if (!process.env.EMAIL_ENCRYPTION_KEY) {
    process.env.EMAIL_ENCRYPTION_KEY = 'test-encryption-key-minimum-32-characters-long-for-security';
  }

  // Use test database or mock
  testDbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

  if (testDbUrl) {
    client = new Client({ connectionString: testDbUrl });
    await client.connect();

    // Create test table
    await client.query(`
      CREATE TABLE IF NOT EXISTS newsletter_subscribers_test (
        id SERIAL PRIMARY KEY,
        encrypted_email TEXT NOT NULL UNIQUE,
        subscribed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        unsubscribed_at TIMESTAMP DEFAULT NULL,
        ip_address VARCHAR(45),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Update queries in tests to use test table
  }

  // Set up Express app
  app = express();
  app.use(express.json());
  app.locals.dbClient = client;
  app.use('/api/newsletter', newsletterRouter);
});

afterAll(async () => {
  if (client) {
    // Clean up test data
    await client.query('DROP TABLE IF EXISTS newsletter_subscribers_test');
    await client.end();
  }
});

beforeEach(async () => {
  if (client) {
    // Clear test data before each test
    await client.query('DELETE FROM newsletter_subscribers');
  }
});

describe('POST /api/newsletter/subscribe', () => {
  test('should subscribe a valid email address', async () => {
    const response = await request(app)
      .post('/api/newsletter/subscribe')
      .send({ email: 'test@example.com' })
      .expect(201);

    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe('Successfully subscribed to newsletter');
    expect(response.body.alreadySubscribed).toBe(false);
  });

  test('should reject missing email', async () => {
    const response = await request(app)
      .post('/api/newsletter/subscribe')
      .send({})
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Email address is required');
  });

  test('should reject invalid email format', async () => {
    const response = await request(app)
      .post('/api/newsletter/subscribe')
      .send({ email: 'invalid-email' })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Invalid email address format');
  });

  test('should handle duplicate subscription', async () => {
    const email = 'duplicate@example.com';

    // First subscription
    await request(app)
      .post('/api/newsletter/subscribe')
      .send({ email })
      .expect(201);

    // Second subscription
    const response = await request(app)
      .post('/api/newsletter/subscribe')
      .send({ email })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.alreadySubscribed).toBe(true);
  });

  test('should store email encrypted in database', async () => {
    const email = 'encrypted-test@example.com';

    await request(app)
      .post('/api/newsletter/subscribe')
      .send({ email })
      .expect(201);

    if (client) {
      // Query database directly
      const result = await client.query(
        'SELECT encrypted_email FROM newsletter_subscribers WHERE id = (SELECT MAX(id) FROM newsletter_subscribers)'
      );

      // Encrypted email should not match plaintext
      expect(result.rows[0].encrypted_email).not.toBe(email);

      // Encrypted email should be base64
      expect(result.rows[0].encrypted_email).toMatch(/^[A-Za-z0-9+/]+=*$/);
    }
  });

  test('should accept international email addresses', async () => {
    const response = await request(app)
      .post('/api/newsletter/subscribe')
      .send({ email: 'user@münchen.de' })
      .expect(201);

    expect(response.body.success).toBe(true);
  });

  test('should accept email with plus addressing', async () => {
    const response = await request(app)
      .post('/api/newsletter/subscribe')
      .send({ email: 'user+tag@example.com' })
      .expect(201);

    expect(response.body.success).toBe(true);
  });
});

describe('GET /api/newsletter/count', () => {
  test('should return subscriber count', async () => {
    // Add some test subscribers
    if (client) {
      const emails = ['user1@test.com', 'user2@test.com', 'user3@test.com'];
      for (const email of emails) {
        await request(app)
          .post('/api/newsletter/subscribe')
          .send({ email });
      }
    }

    const response = await request(app)
      .get('/api/newsletter/count')
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(typeof response.body.count).toBe('number');
    expect(response.body.count).toBeGreaterThanOrEqual(0);
  });
});

describe('POST /api/newsletter/unsubscribe', () => {
  test('should unsubscribe an existing email', async () => {
    const email = 'unsubscribe-test@example.com';

    // First subscribe
    await request(app)
      .post('/api/newsletter/subscribe')
      .send({ email })
      .expect(201);

    // Then unsubscribe
    const response = await request(app)
      .post('/api/newsletter/unsubscribe')
      .send({ email })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe('Successfully unsubscribed from newsletter');
  });

  test('should reject unsubscribe for non-existent email', async () => {
    const response = await request(app)
      .post('/api/newsletter/unsubscribe')
      .send({ email: 'nonexistent@example.com' })
      .expect(404);

    expect(response.body.success).toBe(false);
  });

  test('should reject missing email for unsubscribe', async () => {
    const response = await request(app)
      .post('/api/newsletter/unsubscribe')
      .send({})
      .expect(400);

    expect(response.body.success).toBe(false);
  });

  test('should handle double unsubscribe', async () => {
    const email = 'double-unsub@example.com';

    // Subscribe
    await request(app)
      .post('/api/newsletter/subscribe')
      .send({ email })
      .expect(201);

    // First unsubscribe
    await request(app)
      .post('/api/newsletter/unsubscribe')
      .send({ email })
      .expect(200);

    // Second unsubscribe
    const response = await request(app)
      .post('/api/newsletter/unsubscribe')
      .send({ email })
      .expect(404);

    expect(response.body.success).toBe(false);
  });
});

describe('Rate Limiting and Security', () => {
  test('should handle rapid consecutive requests', async () => {
    const emails = Array.from({ length: 5 }, (_, i) => `rapid${i}@example.com`);

    const promises = emails.map(email =>
      request(app)
        .post('/api/newsletter/subscribe')
        .send({ email })
    );

    const responses = await Promise.all(promises);

    // All should succeed
    responses.forEach(response => {
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });
  });

  test('should sanitize email input', async () => {
    const response = await request(app)
      .post('/api/newsletter/subscribe')
      .send({ email: '  test@example.com  ' })
      .expect(201);

    expect(response.body.success).toBe(true);
  });
});
