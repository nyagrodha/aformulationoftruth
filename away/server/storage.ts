import { eq, and, gt } from 'drizzle-orm';
import { db } from './db';
import {
  users,
  magicLinks,
  thankYouMessages,
  type InsertUser,
  type InsertMagicLink,
  type InsertThankYouMessage,
} from '../shared/schema';

class Storage {
  // ── Users ──────────────────────────────────────────────────────────────────

  async getUser(id: string) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user ?? null;
  }

  async getUserByEmail(email: string) {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user ?? null;
  }

  async createUser(data: InsertUser) {
    const [user] = await db.insert(users).values(data).returning();
    return user;
  }

  // ── Magic links ────────────────────────────────────────────────────────────

  async createMagicLink(data: InsertMagicLink) {
    const [link] = await db.insert(magicLinks).values(data).returning();
    return link;
  }

  async getMagicLink(token: string) {
    const [link] = await db
      .select()
      .from(magicLinks)
      .where(
        and(
          eq(magicLinks.token, token),
          eq(magicLinks.used, false),
          gt(magicLinks.expiresAt, new Date()),
        ),
      );
    return link ?? null;
  }

  async markMagicLinkUsed(token: string) {
    await db
      .update(magicLinks)
      .set({ used: true })
      .where(eq(magicLinks.token, token));
  }

  // ── Thank-you messages ─────────────────────────────────────────────────────

  async createThankYouMessage(data: InsertThankYouMessage) {
    const [message] = await db
      .insert(thankYouMessages)
      .values(data)
      .returning();
    return message;
  }

  async markMessageDelivered(id: string) {
    await db
      .update(thankYouMessages)
      .set({ delivered: true, deliveredAt: new Date() })
      .where(eq(thankYouMessages.id, id));
  }

  async getMessagesByUser(userId: string) {
    return db
      .select()
      .from(thankYouMessages)
      .where(eq(thankYouMessages.userId, userId));
  }
}

export const storage = new Storage();
