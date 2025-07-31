import { 
  users, 
  magicLinks, 
  questionnaireSessions, 
  responses,
  type User, 
  type InsertUser,
  type UpsertUser,
  type MagicLink,
  type InsertMagicLink,
  type QuestionnaireSession,
  type InsertQuestionnaireSession,
  type Response,
  type InsertResponse
} from "@shared/schema";
import { db } from "./db";
import { eq, and, gt, desc, sql, like, or, ilike } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  incrementUserCompletionCount(userId: string): Promise<User>;

  // Magic link operations
  createMagicLink(magicLink: InsertMagicLink): Promise<MagicLink>;
  getMagicLink(token: string): Promise<MagicLink | undefined>;
  markMagicLinkUsed(token: string): Promise<void>;

  // Session operations
  getSessionByUserId(userId: string): Promise<QuestionnaireSession | undefined>;
  getSessionById(sessionId: string): Promise<QuestionnaireSession | undefined>;
  getSessionByShareId(shareId: string): Promise<QuestionnaireSession | undefined>;
  createSession(session: InsertQuestionnaireSession): Promise<QuestionnaireSession>;
  updateSessionProgress(sessionId: string, questionIndex: number): Promise<void>;
  completeSession(sessionId: string, wantsReminder?: boolean, wantsToShare?: boolean): Promise<string | null>;
  getUserCompletedSessions(userId: string): Promise<QuestionnaireSession[]>;

  // Response operations
  getResponsesBySessionId(sessionId: string): Promise<Response[]>;
  createResponse(response: InsertResponse): Promise<Response>;
  updateResponse(sessionId: string, questionId: number, answer: string): Promise<Response>;
  getResponseBySessionAndQuestion(sessionId: string, questionId: number): Promise<Response | undefined>;

  // Admin operations
  searchUsers(query: string, limit?: number): Promise<User[]>;
  getAllSessions(limit?: number, offset?: number): Promise<QuestionnaireSession[]>;
  searchSessions(query: string, limit?: number): Promise<QuestionnaireSession[]>;
  searchResponses(query: string, limit?: number): Promise<Response[]>;
  getSessionsWithResponses(limit?: number, offset?: number): Promise<(QuestionnaireSession & { user: User; responses: Response[] })[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async incrementUserCompletionCount(userId: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ 
        completionCount: sql`${users.completionCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async createMagicLink(insertMagicLink: InsertMagicLink): Promise<MagicLink> {
    const [magicLink] = await db
      .insert(magicLinks)
      .values(insertMagicLink)
      .returning();
    return magicLink;
  }

  async getMagicLink(token: string): Promise<MagicLink | undefined> {
    const [magicLink] = await db
      .select()
      .from(magicLinks)
      .where(
        and(
          eq(magicLinks.token, token),
          eq(magicLinks.used, false),
          gt(magicLinks.expiresAt, new Date())
        )
      );
    return magicLink || undefined;
  }

  async markMagicLinkUsed(token: string): Promise<void> {
    await db
      .update(magicLinks)
      .set({ used: true })
      .where(eq(magicLinks.token, token));
  }

  async getSessionByUserId(userId: string): Promise<QuestionnaireSession | undefined> {
    const [session] = await db
      .select()
      .from(questionnaireSessions)
      .where(eq(questionnaireSessions.userId, userId));
    return session || undefined;
  }

  async getSessionById(sessionId: string): Promise<QuestionnaireSession | undefined> {
    const [session] = await db
      .select()
      .from(questionnaireSessions)
      .where(eq(questionnaireSessions.id, sessionId));
    return session || undefined;
  }

  async createSession(insertSession: InsertQuestionnaireSession): Promise<QuestionnaireSession> {
    const [session] = await db
      .insert(questionnaireSessions)
      .values(insertSession)
      .returning();
    return session;
  }

  async updateSessionProgress(sessionId: string, questionIndex: number): Promise<void> {
    await db
      .update(questionnaireSessions)
      .set({ 
        currentQuestionIndex: questionIndex,
        updatedAt: new Date()
      })
      .where(eq(questionnaireSessions.id, sessionId));
  }

  async completeSession(sessionId: string, wantsReminder: boolean = false, wantsToShare: boolean = false): Promise<string | null> {
    const shareId = wantsToShare ? sql`gen_random_uuid()` : null;
    
    await db
      .update(questionnaireSessions)
      .set({ 
        completed: true,
        completedAt: new Date(),
        wantsReminder,
        isShared: wantsToShare,
        shareId: shareId,
        updatedAt: new Date()
      })
      .where(eq(questionnaireSessions.id, sessionId));

    if (wantsToShare) {
      // Get the generated shareId
      const [session] = await db
        .select({ shareId: questionnaireSessions.shareId })
        .from(questionnaireSessions)
        .where(eq(questionnaireSessions.id, sessionId));
      
      return session?.shareId || null;
    }
    
    return null;
  }

  async getSessionByShareId(shareId: string): Promise<QuestionnaireSession | undefined> {
    const [session] = await db
      .select()
      .from(questionnaireSessions)
      .where(and(
        eq(questionnaireSessions.shareId, shareId),
        eq(questionnaireSessions.isShared, true),
        eq(questionnaireSessions.completed, true)
      ));
    return session || undefined;
  }

  async getUserCompletedSessions(userId: string): Promise<QuestionnaireSession[]> {
    return await db
      .select()
      .from(questionnaireSessions)
      .where(and(
        eq(questionnaireSessions.userId, userId),
        eq(questionnaireSessions.completed, true)
      ))
      .orderBy(desc(questionnaireSessions.completedAt));
  }

  async getResponsesBySessionId(sessionId: string): Promise<Response[]> {
    return await db
      .select()
      .from(responses)
      .where(eq(responses.sessionId, sessionId));
  }

  async createResponse(insertResponse: InsertResponse): Promise<Response> {
    const [response] = await db
      .insert(responses)
      .values(insertResponse)
      .returning();
    return response;
  }

  async updateResponse(sessionId: string, questionId: number, answer: string): Promise<Response> {
    const [response] = await db
      .update(responses)
      .set({ 
        answer,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(responses.sessionId, sessionId),
          eq(responses.questionId, questionId)
        )
      )
      .returning();
    return response;
  }

  async setSessionReviewingDeclined(sessionId: string, reviewing: boolean): Promise<void> {
    await db
      .update(questionnaireSessions)
      .set({ 
        reviewingDeclined: reviewing,
        updatedAt: new Date()
      })
      .where(eq(questionnaireSessions.id, sessionId));
  }

  async getResponseBySessionAndQuestion(sessionId: string, questionId: number): Promise<Response | undefined> {
    const [response] = await db
      .select()
      .from(responses)
      .where(
        and(
          eq(responses.sessionId, sessionId),
          eq(responses.questionId, questionId)
        )
      );
    return response || undefined;
  }

  async getSessionsEligibleForReminders(): Promise<QuestionnaireSession[]> {
    return await db
      .select()
      .from(questionnaireSessions)
      .where(and(
        eq(questionnaireSessions.completed, true),
        eq(questionnaireSessions.wantsReminder, true)
      ));
  }

  // Admin operations
  async searchUsers(query: string, limit: number = 50): Promise<User[]> {
    return await db
      .select()
      .from(users)
      .where(
        or(
          ilike(users.email, `%${query}%`),
          ilike(users.firstName, `%${query}%`),
          ilike(users.lastName, `%${query}%`),
          ilike(users.id, `%${query}%`)
        )
      )
      .limit(limit)
      .orderBy(desc(users.createdAt));
  }

  async getAllSessions(limit: number = 50, offset: number = 0): Promise<QuestionnaireSession[]> {
    return await db
      .select()
      .from(questionnaireSessions)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(questionnaireSessions.createdAt));
  }

  async searchSessions(query: string, limit: number = 50): Promise<QuestionnaireSession[]> {
    return await db
      .select()
      .from(questionnaireSessions)
      .where(
        or(
          ilike(questionnaireSessions.id, `%${query}%`),
          ilike(questionnaireSessions.userId, `%${query}%`),
          ilike(questionnaireSessions.shareId, `%${query}%`)
        )
      )
      .limit(limit)
      .orderBy(desc(questionnaireSessions.createdAt));
  }

  async searchResponses(query: string, limit: number = 50): Promise<Response[]> {
    return await db
      .select()
      .from(responses)
      .where(
        or(
          ilike(responses.answer, `%${query}%`),
          ilike(responses.sessionId, `%${query}%`),
          ilike(responses.id, `%${query}%`)
        )
      )
      .limit(limit)
      .orderBy(desc(responses.createdAt));
  }

  async getSessionsWithResponses(limit: number = 20, offset: number = 0): Promise<(QuestionnaireSession & { user: User; responses: Response[] })[]> {
    const sessionsData = await db
      .select({
        session: questionnaireSessions,
        user: users
      })
      .from(questionnaireSessions)
      .leftJoin(users, eq(questionnaireSessions.userId, users.id))
      .limit(limit)
      .offset(offset)
      .orderBy(desc(questionnaireSessions.createdAt));

    const results = [];
    for (const { session, user } of sessionsData) {
      if (session && user) {
        const responses = await this.getResponsesBySessionId(session.id);
        results.push({ ...session, user, responses });
      }
    }
    
    return results;
  }
}

export const storage = new DatabaseStorage();
