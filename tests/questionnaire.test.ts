import request from 'supertest';
import app from '../src/app.js';
import { setupDatabase, resetDatabase, teardownDatabase } from './helpers/db.js';
import { getPool } from '../src/db/pool.js';
import { hashPassword } from '../src/utils/password.js';

beforeAll(async () => {
  await setupDatabase();
});

afterAll(async () => {
  await teardownDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

function extractToken(response: request.Response): string {
  const token = response.body?.csrfToken;
  if (!token) {
    throw new Error('Missing CSRF token');
  }
  return token;
}

describe('Questionnaire routes', () => {
  it('restricts response listing to admins', async () => {
    const pool = getPool();
    const passwordHash = await hashPassword('AdminPassword123!');
    await pool.query(
      `INSERT INTO users (email, username, password_hash, role) VALUES ($1, $2, $3, 'admin') RETURNING id`,
      ['admin@example.com', 'adminuser', passwordHash]
    );

    await pool.query(
      `INSERT INTO questionnaire_responses (email, answers) VALUES ($1, $2)`,
      ['participant@example.com', { answer: 'yes' }]
    );

    const agent = request.agent(app);
    const csrf = extractToken(await agent.get('/auth/csrf-token'));

    await agent
      .post('/auth/login')
      .set('x-csrf-token', csrf)
      .send({ identifier: 'admin@example.com', password: 'AdminPassword123!' });

    const listResponse = await agent.get('/api/responses');
    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toHaveLength(1);
  });

  it('blocks non-admin users from listing responses', async () => {
    const pool = getPool();
    const passwordHash = await hashPassword('UserPassword123!');
    await pool.query(
      `INSERT INTO users (email, username, password_hash, role) VALUES ($1, $2, $3, 'user')`,
      ['user@example.com', 'normaluser', passwordHash]
    );

    const agent = request.agent(app);
    const csrf = extractToken(await agent.get('/auth/csrf-token'));

    await agent
      .post('/auth/login')
      .set('x-csrf-token', csrf)
      .send({ identifier: 'user@example.com', password: 'UserPassword123!' });

    const response = await agent.get('/api/responses');
    expect(response.status).toBe(403);
  });
});
