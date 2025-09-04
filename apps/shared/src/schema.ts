import { pgTable, serial, text, timestamp, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { z } from "zod";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").unique(),
  name: text("name"),
  createdAt: timestamp("created_at").defaultNow(),
  completionCount: integer("completion_count").default(0),
});

export const questionnaireSessions = pgTable("questionnaire_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  // Keep it untyped at the DB column level to avoid TS gymnastics for now:
  questionOrder: jsonb("question_order"),
  currentQuestionIndex: integer("current_question_index").default(0),
  completed: boolean("completed").default(false),
  completedAt: timestamp("completed_at"),
  wantsReminder: boolean("wants_reminder").default(false),
  isShared: boolean("is_shared").default(false),
  shareId: text("share_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const responses = pgTable("responses", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").references(() => questionnaireSessions.id),
  questionId: integer("question_id"),
  answer: text("answer"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Minimal types to unblock compilation tonight:
export type Response = {
  id: number;
  sessionId: string | null;
  questionId: number | null;
  answer: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};
export type NewResponse = Omit<Response, "id" | "createdAt" | "updatedAt">;
export const insertResponseSchema = z.object({
  sessionId: z.string(),
  questionId: z.number(),
  answer: z.string().min(1, "Answer cannot be empty"),
});
