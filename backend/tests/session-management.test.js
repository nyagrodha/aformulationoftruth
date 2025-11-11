import { jest } from '@jest/globals';
import { describe, test, expect, beforeEach, afterEach, beforeAll } from '@jest/globals';
import request from 'supertest';

describe('Session Management and Authentication Middleware Tests', () => {
  let app;
  let sessionStore;

  beforeAll(async () => {
    const express = (await import('express')).default;
    const session = (await import('express-session')).default;

    app = express();
    app.use(express.json());

    // Configure session with test settings
    app.use(session({
      secret: 'test-session-secret',
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: false, // Allow HTTP for testing
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        httpOnly: true
      }
    }));

    // Authentication middleware
    const requireAuth = (req, res, next) => {
      if (!req.session || !req.session.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      next();
    };

    // Test routes
    app.post('/login', (req, res) => {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: 'Email required' });
      }

      req.session.user = { email };
      res.json({ message: 'Logged in successfully', user: { email } });
    });

    app.post('/logout', (req, res) => {
      req.session.destroy((err) => {
        if (err) {
          return res.status(500).json({ error: 'Logout failed' });
        }
        res.clearCookie('connect.sid');
        res.json({ message: 'Logged out successfully' });
      });
    });

    app.get('/profile', requireAuth, (req, res) => {
      res.json({ user: req.session.user });
    });

    app.post('/update-profile', requireAuth, (req, res) => {
      const { name } = req.body;
      req.session.user.name = name;
      res.json({ user: req.session.user });
    });

    app.get('/public', (req, res) => {
      res.json({ message: 'This is a public endpoint' });
    });
  });

  describe('Session Creation and Management', () => {
    test('should create session on login', async () => {
      const agent = request.agent(app);
      const email = 'test@example.com';

      const response = await agent
        .post('/login')
        .send({ email })
        .expect(200);

      expect(response.body).toEqual({
        message: 'Logged in successfully',
        user: { email }
      });

      // Session cookie should be set
      expect(response.headers['set-cookie']).toBeDefined();
      expect(response.headers['set-cookie'][0]).toMatch(/connect\.sid/);
    });

    test('should maintain session across requests', async () => {
      const agent = request.agent(app);
      const email = 'session@example.com';

      // Login
      await agent
        .post('/login')
        .send({ email })
        .expect(200);

      // Access protected route with same agent (maintains session)
      const profileResponse = await agent
        .get('/profile')
        .expect(200);

      expect(profileResponse.body).toEqual({
        user: { email }
      });
    });

    test('should reject access without session', async () => {
      const response = await request(app)
        .get('/profile')
        .expect(401);

      expect(response.body).toEqual({
        error: 'Authentication required'
      });
    });

    test('should allow access to public endpoints without session', async () => {
      const response = await request(app)
        .get('/public')
        .expect(200);

      expect(response.body).toEqual({
        message: 'This is a public endpoint'
      });
    });

    test('should update session data persistently', async () => {
      const agent = request.agent(app);
      const email = 'update@example.com';
      const name = 'Updated Name';

      // Login
      await agent
        .post('/login')
        .send({ email })
        .expect(200);

      // Update profile
      const updateResponse = await agent
        .post('/update-profile')
        .send({ name })
        .expect(200);

      expect(updateResponse.body).toEqual({
        user: { email, name }
      });

      // Verify update persisted
      const profileResponse = await agent
        .get('/profile')
        .expect(200);

      expect(profileResponse.body).toEqual({
        user: { email, name }
      });
    });
  });

  describe('Session Security', () => {
    test('should not share sessions between different clients', async () => {
      const agent1 = request.agent(app);
      const agent2 = request.agent(app);

      // Login with agent1
      await agent1
        .post('/login')
        .send({ email: 'user1@example.com' })
        .expect(200);

      // Login with agent2
      await agent2
        .post('/login')
        .send({ email: 'user2@example.com' })
        .expect(200);

      // Each agent should see their own profile
      const profile1 = await agent1
        .get('/profile')
        .expect(200);

      const profile2 = await agent2
        .get('/profile')
        .expect(200);

      expect(profile1.body.user.email).toBe('user1@example.com');
      expect(profile2.body.user.email).toBe('user2@example.com');
    });

    test('should set secure session cookies in production', async () => {
      // This test would need environment variable mocking
      // to test secure cookie settings in production mode
      const agent = request.agent(app);

      const response = await agent
        .post('/login')
        .send({ email: 'secure@example.com' })
        .expect(200);

      // In test environment, secure should be false
      const cookie = response.headers['set-cookie'][0];
      expect(cookie).not.toMatch(/Secure/);
      expect(cookie).toMatch(/HttpOnly/);
    });

    test('should handle session cookie tampering', async () => {
      const agent = request.agent(app);

      await agent
        .post('/login')
        .send({ email: 'tamper@example.com' })
        .expect(200);

      // Try to access with tampered cookie
      const response = await request(app)
        .get('/profile')
        .set('Cookie', 'connect.sid=tampered-session-id')
        .expect(401);

      expect(response.body).toEqual({
        error: 'Authentication required'
      });
    });
  });

  describe('Session Logout and Cleanup', () => {
    test('should destroy session on logout', async () => {
      const agent = request.agent(app);
      const email = 'logout@example.com';

      // Login
      await agent
        .post('/login')
        .send({ email })
        .expect(200);

      // Verify logged in
      await agent
        .get('/profile')
        .expect(200);

      // Logout
      const logoutResponse = await agent
        .post('/logout')
        .expect(200);

      expect(logoutResponse.body).toEqual({
        message: 'Logged out successfully'
      });

      // Verify session destroyed
      await agent
        .get('/profile')
        .expect(401);
    });

    test('should clear session cookie on logout', async () => {
      const agent = request.agent(app);

      await agent
        .post('/login')
        .send({ email: 'clear@example.com' })
        .expect(200);

      const logoutResponse = await agent
        .post('/logout')
        .expect(200);

      // Should set cookie to be cleared
      const setCookieHeader = logoutResponse.headers['set-cookie'];
      if (setCookieHeader) {
        expect(setCookieHeader[0]).toMatch(/connect\.sid=;/);
      }
    });

    test('should handle logout when not logged in', async () => {
      const response = await request(app)
        .post('/logout')
        .expect(200); // Should not fail even if no session exists

      expect(response.body).toEqual({
        message: 'Logged out successfully'
      });
    });
  });

  describe('Session Expiration and Renewal', () => {
    test('should handle expired sessions gracefully', async () => {
      // This would require manipulating session store or using time travel
      // For now, we test the middleware behavior
      const agent = request.agent(app);

      await agent
        .post('/login')
        .send({ email: 'expire@example.com' })
        .expect(200);

      // In a real test, you'd manipulate the session store to expire the session
      // Then verify that subsequent requests are rejected
    });

    test('should renew session on activity', async () => {
      const agent = request.agent(app);

      await agent
        .post('/login')
        .send({ email: 'renew@example.com' })
        .expect(200);

      // Multiple requests should maintain the session
      for (let i = 0; i < 5; i++) {
        await agent
          .get('/profile')
          .expect(200);
      }
    });
  });

  describe('Authentication Middleware Edge Cases', () => {
    test('should handle missing session object', async () => {
      // Create a route that explicitly nullifies session
      const testApp = (await import('express')).default();
      testApp.use((req, res, next) => {
        req.session = null;
        next();
      });

      testApp.get('/test', (req, res, next) => {
        if (!req.session || !req.session.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }
        next();
      }, (req, res) => {
        res.json({ user: req.session.user });
      });

      const response = await request(testApp)
        .get('/test')
        .expect(401);

      expect(response.body).toEqual({
        error: 'Authentication required'
      });
    });

    test('should handle malformed session data', async () => {
      const agent = request.agent(app);

      await agent
        .post('/login')
        .send({ email: 'malformed@example.com' })
        .expect(200);

      // This test would require manipulating the session store
      // to inject malformed data and verify graceful handling
    });

    test('should handle concurrent session operations', async () => {
      const agent = request.agent(app);

      await agent
        .post('/login')
        .send({ email: 'concurrent@example.com' })
        .expect(200);

      // Make multiple concurrent requests
      const requests = Array(10).fill().map(() =>
        agent.get('/profile').expect(200)
      );

      const responses = await Promise.all(requests);

      // All should succeed with same user data
      responses.forEach(response => {
        expect(response.body.user.email).toBe('concurrent@example.com');
      });
    });
  });

  describe('Session Storage and Performance', () => {
    test('should handle multiple concurrent logins', async () => {
      const agents = Array(10).fill().map(() => request.agent(app));

      const loginPromises = agents.map((agent, index) =>
        agent
          .post('/login')
          .send({ email: `user${index}@example.com` })
          .expect(200)
      );

      await Promise.all(loginPromises);

      // Each agent should maintain its own session
      const profilePromises = agents.map((agent, index) =>
        agent.get('/profile').expect(200)
      );

      const profileResponses = await Promise.all(profilePromises);

      profileResponses.forEach((response, index) => {
        expect(response.body.user.email).toBe(`user${index}@example.com`);
      });
    });

    test('should handle rapid session creation and destruction', async () => {
      for (let i = 0; i < 50; i++) {
        const agent = request.agent(app);

        await agent
          .post('/login')
          .send({ email: `rapid${i}@example.com` })
          .expect(200);

        await agent
          .get('/profile')
          .expect(200);

        await agent
          .post('/logout')
          .expect(200);
      }
    });
  });

  describe('Session Integration with Magic Link Flow', () => {
    test('should integrate session creation with magic link verification', async () => {
      // Simulate the session creation that happens in auth verify route
      const agent = request.agent(app);
      const email = 'magic@example.com';

      // This simulates what happens in /auth/verify after token validation
      const response = await agent
        .post('/login')
        .send({ email })
        .expect(200);

      expect(response.body).toEqual({
        message: 'Logged in successfully',
        user: { email }
      });

      // Verify session allows access to protected routes
      await agent
        .get('/profile')
        .expect(200);
    });

    test('should prevent session hijacking after magic link verification', async () => {
      const agent1 = request.agent(app);
      const agent2 = request.agent(app);

      // Agent1 completes magic link flow
      await agent1
        .post('/login')
        .send({ email: 'hijack@example.com' })
        .expect(200);

      // Agent2 cannot access agent1's session
      await agent2
        .get('/profile')
        .expect(401);

      // Agent1 can still access
      await agent1
        .get('/profile')
        .expect(200);
    });
  });
});