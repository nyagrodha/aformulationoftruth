// tests/questions.test.js
import request from 'supertest';
import app     from '../src/app.js';

describe('Question Routes', () => {
  it('GET /questions/next responds with next question or completed flag', async () => {
    const res = await request(app)
      .get('/questions/next')
      .query({ email: 'test@example.com' });
    expect(res.status).toBe(200);
    if (res.body.completed !== true) {
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('text');
    }
  });
});
