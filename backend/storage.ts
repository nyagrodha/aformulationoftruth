import { db } from './db';
import { sql } from 'drizzle-orm';
import { users, questionnaireSessions, responses } from './shared/schema';
import { eq, and, desc, like, or, ilike } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

class Storage {
  async getUser(id: string) {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0] || null;
  }

  async createUser(userData: { id: string; email: string; name?: string }) {
    const result = await db.insert(users).values(userData).returning();
    return result[0];
  }

  async createSession(sessionData: { userId: string; questionOrder: number[] }) {
    const id = uuidv4();
    const result = await db.insert(questionnaireSessions).values({
      id,
      ...sessionData,
    }).returning();
    return result[0];
  }

  async getSessionByUserId(userId: string) {
    const result = await db.select()
      .from(questionnaireSessions)
      .where(and(
        eq(questionnaireSessions.userId, userId),
        eq(questionnaireSessions.completed, false)
      ));
    return result[0] || null;
  }

  async getSessionById(id: string) {
    const result = await db.select().from(questionnaireSessions).where(eq(questionnaireSessions.id, id));
    return result[0] || null;
  }

  async createResponse(responseData: { sessionId: string; questionId: number; answer: string }) {
    const result = await db.insert(responses).values(responseData).returning();
    return result[0];
  }

  async updateResponse(sessionId: string, questionId: number, answer: string) {
    const result = await db.update(responses)
      .set({ answer, updatedAt: new Date() })
      .where(and(
        eq(responses.sessionId, sessionId),
        eq(responses.questionId, questionId)
      ))
      .returning();
    return result[0];
  }

  async getResponseBySessionAndQuestion(sessionId: string, questionId: number) {
    const result = await db.select()
      .from(responses)
      .where(and(
        eq(responses.sessionId, sessionId),
        eq(responses.questionId, questionId)
      ));
    return result[0] || null;
  }

  async getResponsesBySessionId(sessionId: string) {
    return await db.select().from(responses).where(eq(responses.sessionId, sessionId));
  }

  async updateSessionProgress(sessionId: string, currentQuestionIndex: number) {
    const result = await db.update(questionnaireSessions)
      .set({ currentQuestionIndex })
      .where(eq(questionnaireSessions.id, sessionId))
      .returning();
    return result[0];
  }

  async completeSession(sessionId: string, wantsReminder: boolean, wantsToShare: boolean = false) {
    const shareId = wantsToShare ? uuidv4() : null;
    
    const result = await db.update(questionnaireSessions)
      .set({ 
        completed: true, 
        completedAt: new Date(),
        wantsReminder,
        isShared: wantsToShare,
        shareId
      })
      .where(eq(questionnaireSessions.id, sessionId))
      .returning();
    
    return shareId;
  }

  async getUserCompletedSessions(userId: string) {
    return await db.select()
      .from(questionnaireSessions)
      .where(and(
        eq(questionnaireSessions.userId, userId),
        eq(questionnaireSessions.completed, true)
      ))
      .orderBy(desc(questionnaireSessions.completedAt));
  }

  async incrementUserCompletionCount(userId: string) {
    const result = await db.update(users)
      .set({ completionCount: sql`${users.completionCount} + 1` })
      .where(eq(users.id, userId))
      .returning();
    return result[0];
  }

  async getSessionByShareId(shareId: string) {
    const result = await db.select()
      .from(questionnaireSessions)
      .where(and(
        eq(questionnaireSessions.shareId, shareId),
        eq(questionnaireSessions.isShared, true)
      ));
    return result[0] || null;
  }
}

export const storage = new Storage();
