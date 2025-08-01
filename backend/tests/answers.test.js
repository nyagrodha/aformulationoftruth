// tests/answers.test.js
import request from 'supertest';
import app     from '../src/app.js';

describe('Answer Routes', () => {
  it('POST /answers should record an answer', async () => {
    const payload = { email: 'test@example.com', questionId: 1, answer: 'My test answer' };
    const res = await request(app)
      .post('/answers')
      .send(payload);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('answerId');
  });
});
