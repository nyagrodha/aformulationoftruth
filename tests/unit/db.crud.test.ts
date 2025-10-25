import { pool } from '../../server/db';
import { db } from '../../server/db';
import { users, magicLinks, questionnaireSessions, responses } from '@shared/schema';
import { eq } from 'drizzle-orm';

describe('Database CRUD Operations Tests', () => {
  // Clean up test data after all tests
  afterAll(async () => {
    // Clean up any test data created during tests
    await pool.query(`
      DELETE FROM responses WHERE answer LIKE 'test-answer-%';
      DELETE FROM questionnaire_sessions WHERE id LIKE 'test-%';
      DELETE FROM magic_links WHERE email LIKE 'test-%';
      DELETE FROM users WHERE email LIKE 'test-%';
    `);
  });

  describe('Users Table CRUD', () => {
    let testUserId: string;

    it('should insert a new user', async () => {
      const result = await db.insert(users).values({
        email: `test-${Date.now()}@example.com`,
        firstName: 'Test',
        lastName: 'User',
      }).returning();

      expect(result).toHaveLength(1);
      expect(result[0].email).toContain('test-');
      testUserId = result[0].id;
    });

    it('should read user by id', async () => {
      if (!testUserId) {
        // Create a user first
        const created = await db.insert(users).values({
          email: `test-read-${Date.now()}@example.com`,
        }).returning();
        testUserId = created[0].id;
      }

      const result = await db.select().from(users).where(eq(users.id, testUserId));
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(testUserId);
    });

    it('should update user', async () => {
      if (!testUserId) {
        const created = await db.insert(users).values({
          email: `test-update-${Date.now()}@example.com`,
        }).returning();
        testUserId = created[0].id;
      }

      await db.update(users)
        .set({ firstName: 'Updated', completionCount: 1 })
        .where(eq(users.id, testUserId));

      const result = await db.select().from(users).where(eq(users.id, testUserId));
      expect(result[0].firstName).toBe('Updated');
      expect(result[0].completionCount).toBe(1);
    });

    it('should delete user', async () => {
      // Create a user to delete
      const created = await db.insert(users).values({
        email: `test-delete-${Date.now()}@example.com`,
      }).returning();

      await db.delete(users).where(eq(users.id, created[0].id));

      const result = await db.select().from(users).where(eq(users.id, created[0].id));
      expect(result).toHaveLength(0);
    });

    it('should enforce email uniqueness', async () => {
      const email = `test-unique-${Date.now()}@example.com`;
      await db.insert(users).values({ email });

      await expect(
        db.insert(users).values({ email })
      ).rejects.toThrow();
    });

    it('should set default values correctly', async () => {
      const result = await db.insert(users).values({
        email: `test-defaults-${Date.now()}@example.com`,
      }).returning();

      expect(result[0].completionCount).toBe(0);
      expect(result[0].createdAt).toBeDefined();
      expect(result[0].updatedAt).toBeDefined();
      expect(result[0].id).toBeDefined();
    });
  });

  describe('Magic Links Table CRUD', () => {
    it('should insert a magic link', async () => {
      const result = await db.insert(magicLinks).values({
        email: `test-magic-${Date.now()}@example.com`,
        token: `test-token-${Date.now()}`,
        expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
      }).returning();

      expect(result).toHaveLength(1);
      expect(result[0].used).toBe(false);
      expect(result[0].token).toContain('test-token-');
    });

    it('should read magic link by token', async () => {
      const token = `test-token-read-${Date.now()}`;
      await db.insert(magicLinks).values({
        email: `test-magic-read-${Date.now()}@example.com`,
        token,
        expiresAt: new Date(Date.now() + 3600000),
      });

      const result = await db.select().from(magicLinks).where(eq(magicLinks.token, token));
      expect(result).toHaveLength(1);
      expect(result[0].token).toBe(token);
    });

    it('should update magic link used status', async () => {
      const token = `test-token-update-${Date.now()}`;
      await db.insert(magicLinks).values({
        email: `test-magic-update-${Date.now()}@example.com`,
        token,
        expiresAt: new Date(Date.now() + 3600000),
      });

      await db.update(magicLinks)
        .set({ used: true })
        .where(eq(magicLinks.token, token));

      const result = await db.select().from(magicLinks).where(eq(magicLinks.token, token));
      expect(result[0].used).toBe(true);
    });

    it('should enforce token uniqueness', async () => {
      const token = `test-token-unique-${Date.now()}`;
      await db.insert(magicLinks).values({
        email: `test-magic-${Date.now()}@example.com`,
        token,
        expiresAt: new Date(Date.now() + 3600000),
      });

      await expect(
        db.insert(magicLinks).values({
          email: `test-magic-${Date.now()}@example.com`,
          token,
          expiresAt: new Date(Date.now() + 3600000),
        })
      ).rejects.toThrow();
    });
  });

  describe('Questionnaire Sessions Table CRUD', () => {
    let testUserId: string;
    let testSessionId: string;

    beforeAll(async () => {
      // Create a test user for session tests
      const user = await db.insert(users).values({
        email: `test-session-user-${Date.now()}@example.com`,
      }).returning();
      testUserId = user[0].id;
    });

    it('should insert a questionnaire session', async () => {
      const result = await db.insert(questionnaireSessions).values({
        userId: testUserId,
        questionOrder: [1, 2, 3, 4, 5],
      }).returning();

      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe(testUserId);
      expect(result[0].completed).toBe(false);
      expect(result[0].currentQuestionIndex).toBe(0);
      testSessionId = result[0].id;
    });

    it('should read session by id', async () => {
      const result = await db.select()
        .from(questionnaireSessions)
        .where(eq(questionnaireSessions.id, testSessionId));

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(testSessionId);
    });

    it('should update session progress', async () => {
      await db.update(questionnaireSessions)
        .set({ currentQuestionIndex: 5, completed: true })
        .where(eq(questionnaireSessions.id, testSessionId));

      const result = await db.select()
        .from(questionnaireSessions)
        .where(eq(questionnaireSessions.id, testSessionId));

      expect(result[0].currentQuestionIndex).toBe(5);
      expect(result[0].completed).toBe(true);
    });

    it('should handle JSONB question order', async () => {
      const questionOrder = [5, 3, 1, 4, 2];
      const result = await db.insert(questionnaireSessions).values({
        userId: testUserId,
        questionOrder,
      }).returning();

      expect(result[0].questionOrder).toEqual(questionOrder);
    });

    it('should set share properties', async () => {
      const shareId = `share-${Date.now()}`;
      const result = await db.insert(questionnaireSessions).values({
        userId: testUserId,
        questionOrder: [1, 2, 3],
        isShared: true,
        shareId,
      }).returning();

      expect(result[0].isShared).toBe(true);
      expect(result[0].shareId).toBe(shareId);
    });
  });

  describe('Responses Table CRUD', () => {
    let testUserId: string;
    let testSessionId: string;

    beforeAll(async () => {
      // Create test user and session
      const user = await db.insert(users).values({
        email: `test-response-user-${Date.now()}@example.com`,
      }).returning();
      testUserId = user[0].id;

      const session = await db.insert(questionnaireSessions).values({
        userId: testUserId,
        questionOrder: [1, 2, 3],
      }).returning();
      testSessionId = session[0].id;
    });

    it('should insert a response', async () => {
      const result = await db.insert(responses).values({
        sessionId: testSessionId,
        questionId: 1,
        answer: `test-answer-${Date.now()}`,
      }).returning();

      expect(result).toHaveLength(1);
      expect(result[0].sessionId).toBe(testSessionId);
      expect(result[0].questionId).toBe(1);
    });

    it('should read responses by session', async () => {
      // Insert multiple responses
      await db.insert(responses).values([
        { sessionId: testSessionId, questionId: 2, answer: `test-answer-2-${Date.now()}` },
        { sessionId: testSessionId, questionId: 3, answer: `test-answer-3-${Date.now()}` },
      ]);

      const result = await db.select()
        .from(responses)
        .where(eq(responses.sessionId, testSessionId));

      expect(result.length).toBeGreaterThanOrEqual(3);
    });

    it('should update a response', async () => {
      const created = await db.insert(responses).values({
        sessionId: testSessionId,
        questionId: 10,
        answer: 'original answer',
      }).returning();

      await db.update(responses)
        .set({ answer: 'updated answer' })
        .where(eq(responses.id, created[0].id));

      const result = await db.select()
        .from(responses)
        .where(eq(responses.id, created[0].id));

      expect(result[0].answer).toBe('updated answer');
    });

    it('should delete a response', async () => {
      const created = await db.insert(responses).values({
        sessionId: testSessionId,
        questionId: 99,
        answer: 'to be deleted',
      }).returning();

      await db.delete(responses).where(eq(responses.id, created[0].id));

      const result = await db.select()
        .from(responses)
        .where(eq(responses.id, created[0].id));

      expect(result).toHaveLength(0);
    });
  });

  describe('Foreign Key Constraints', () => {
    it('should prevent creating session with non-existent user', async () => {
      await expect(
        db.insert(questionnaireSessions).values({
          userId: 'non-existent-user-id',
          questionOrder: [1, 2, 3],
        })
      ).rejects.toThrow();
    });

    it('should prevent creating response with non-existent session', async () => {
      await expect(
        db.insert(responses).values({
          sessionId: 'non-existent-session-id',
          questionId: 1,
          answer: 'test',
        })
      ).rejects.toThrow();
    });

    it('should cascade delete or prevent deletion based on constraints', async () => {
      // Create user, session, and response
      const user = await db.insert(users).values({
        email: `test-cascade-${Date.now()}@example.com`,
      }).returning();

      const session = await db.insert(questionnaireSessions).values({
        userId: user[0].id,
        questionOrder: [1, 2, 3],
      }).returning();

      await db.insert(responses).values({
        sessionId: session[0].id,
        questionId: 1,
        answer: 'test',
      });

      // Try to delete user (should fail or cascade depending on constraint)
      const deleteAttempt = async () => {
        await db.delete(users).where(eq(users.id, user[0].id));
      };

      // This should either throw (restrict) or succeed (cascade)
      try {
        await deleteAttempt();
        // If it succeeded, verify cascade worked
        const sessionCheck = await db.select()
          .from(questionnaireSessions)
          .where(eq(questionnaireSessions.id, session[0].id));
        expect(sessionCheck).toHaveLength(0);
      } catch (error) {
        // If it failed, that's also valid behavior (restrict constraint)
        expect(error).toBeDefined();
      }
    });
  });

  describe('Batch Operations', () => {
    it('should insert multiple users in one query', async () => {
      const timestamp = Date.now();
      const result = await db.insert(users).values([
        { email: `test-batch-1-${timestamp}@example.com` },
        { email: `test-batch-2-${timestamp}@example.com` },
        { email: `test-batch-3-${timestamp}@example.com` },
      ]).returning();

      expect(result).toHaveLength(3);
    });

    it('should insert multiple responses in one query', async () => {
      // Create user and session first
      const user = await db.insert(users).values({
        email: `test-batch-response-${Date.now()}@example.com`,
      }).returning();

      const session = await db.insert(questionnaireSessions).values({
        userId: user[0].id,
        questionOrder: [1, 2, 3],
      }).returning();

      const timestamp = Date.now();
      const result = await db.insert(responses).values([
        { sessionId: session[0].id, questionId: 1, answer: `batch-1-${timestamp}` },
        { sessionId: session[0].id, questionId: 2, answer: `batch-2-${timestamp}` },
        { sessionId: session[0].id, questionId: 3, answer: `batch-3-${timestamp}` },
      ]).returning();

      expect(result).toHaveLength(3);
    });
  });
});
