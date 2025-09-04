// src/shared/schema.ts
import {
  pgTable,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: varchar('id', { length: 255 }).primaryKey(), // Matches Auth provider ID
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }),
});

export const questionnaireSessions = pgTable('questionnaire_sessions', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull().references(() => users.id),
  completed: boolean('completed').default(false).notNull(),
  completedAt: timestamp('completed_at'),
  wantsReminder: boolean('wants_reminder').default(false).notNull(),
  isShared: boolean('is_shared').default(false).notNull(),
  shareId: varchar('share_id', { length: 255 }).unique(),
  currentQuestionIndex: integer('current_question_index').default(0).notNull(),
  questionOrder: jsonb('question_order').$type<number[]>().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const responses = pgTable('responses', {
  id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
  sessionId: varchar('session_id', { length: 255 }).notNull().references(() => questionnaireSessions.id),
  questionId: integer('question_id').notNull(),
  // The encrypted JSON blob is stored as text
  answer: text('answer'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
