import request from 'supertest';
import app from '../src/app.js';
import { setupDatabase, resetDatabase, teardownDatabase } from './helpers/db.js';

beforeAll(async () => {
  await setupDatabase();
});

afterAll(async () => {
  await teardownDatabase();
});

beforeEach(async () => {
  await resetDatabase();
});

function extractCsrfToken(response: request.Response): string {
  const token = response.body?.csrfToken;
  if (!token) {
    throw new Error('Missing CSRF token in response');
  }
  return token;
}

function withCsrf(agent: request.SuperAgentTest) {
  return async () => {
    const res = await agent.get('/auth/csrf-token');
    return extractCsrfToken(res);
  };
}

describe('Authentication flows', () => {
  it('allows a user to sign up and retrieve session info', async () => {
    const agent = request.agent(app);
    const getCsrf = withCsrf(agent);
    const csrfToken = await getCsrf();

    const signupResponse = await agent
      .post('/auth/signup')
      .set('x-csrf-token', csrfToken)
      .send({ email: 'user@example.com', username: 'testuser', password: 'SupersafePass1!' });

    expect(signupResponse.status).toBe(201);
    expect(signupResponse.body.user.email).toBe('user@example.com');
    expect(signupResponse.get('set-cookie')).toEqual(expect.arrayContaining([expect.stringContaining('aform_session')]));

    const sessionResponse = await agent.get('/auth/session');
    expect(sessionResponse.body.authenticated).toBe(true);
    expect(sessionResponse.body.user.email).toBe('user@example.com');
  });

  it('rejects invalid login attempts without revealing which field failed', async () => {
    const agent = request.agent(app);
    const getCsrf = withCsrf(agent);
    const csrfToken = await getCsrf();

    await agent
      .post('/auth/signup')
      .set('x-csrf-token', csrfToken)
      .send({ email: 'user@example.com', username: 'testuser', password: 'SupersafePass1!' });

    const csrfForLogin = await getCsrf();
    const loginResponse = await agent
      .post('/auth/login')
      .set('x-csrf-token', csrfForLogin)
      .send({ identifier: 'user@example.com', password: 'wrong' });

    expect(loginResponse.status).toBe(401);
    expect(loginResponse.body).toEqual({ error: 'Invalid credentials' });
  });

  it('supports password reset flow with token', async () => {
    const agent = request.agent(app);
    const getCsrf = withCsrf(agent);
    const csrfToken = await getCsrf();

    await agent
      .post('/auth/signup')
      .set('x-csrf-token', csrfToken)
      .send({ email: 'user@example.com', username: 'testuser', password: 'SupersafePass1!' });

    const csrfForResetRequest = await getCsrf();
    const requestReset = await agent
      .post('/auth/password/request')
      .set('x-csrf-token', csrfForResetRequest)
      .send({ email: 'user@example.com' });

    expect(requestReset.status).toBe(200);
    expect(requestReset.body.message).toMatch(/If the account exists/);
    const token = requestReset.body.token as string;
    expect(typeof token).toBe('string');

    const csrfForReset = await getCsrf();
    const resetResponse = await agent
      .post('/auth/password/reset')
      .set('x-csrf-token', csrfForReset)
      .send({ token, password: 'AnotherStrongPass2!' });

    expect(resetResponse.status).toBe(200);
    expect(resetResponse.body.message).toMatch(/Password has been reset/);

    const csrfForLogin = await getCsrf();
    const loginAfterReset = await agent
      .post('/auth/login')
      .set('x-csrf-token', csrfForLogin)
      .send({ identifier: 'user@example.com', password: 'AnotherStrongPass2!' });

    expect(loginAfterReset.status).toBe(200);
    expect(loginAfterReset.body.user.email).toBe('user@example.com');
  });
});
