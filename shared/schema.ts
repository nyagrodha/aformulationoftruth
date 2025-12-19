import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, jsonb, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for express-session
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  completionCount: integer("completion_count").default(0),
  // Paid profile features
  profileTier: varchar("profile_tier").default("free").notNull(), // 'free' | 'paid'
  encryptionType: varchar("encryption_type").default("server").notNull(), // 'server' | 'client'
  publicKey: text("public_key"), // X25519 public key for paid users with client-side encryption
  username: varchar("username").unique(), // Optional pseudonym for paid users
  bio: text("bio"), // Optional bio for public profiles
  profileVisibility: varchar("profile_visibility").default("private").notNull(), // 'private' | 'anonymous' | 'public'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const magicLinks = pgTable("magic_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Newsletter emails stored with encryption via VPS tunnel
export const newsletterEmails = pgTable("newsletter_emails", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  encryptedEmail: text("encrypted_email").notNull(),
  iv: text("iv").notNull(), // Initialization vector for AES-256-GCM
  tag: text("tag").notNull(), // Authentication tag for AES-256-GCM
  salt: text("salt"), // Random salt for key derivation (null for legacy entries)
  unsubscribeToken: text("unsubscribe_token").notNull().unique(), // Secure token for one-click unsubscribe
  subscribed: boolean("subscribed").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Payment codes for profile upgrades (manual verification)
export const paymentCodes = pgTable("payment_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code").notNull().unique(), // Format: A4OT-XXXX-XXXX
  userId: varchar("user_id").notNull().references(() => users.id),
  amount: integer("amount").notNull(), // Amount in cents (300 = $3.00)
  currency: varchar("currency").default("USD").notNull(), // USD, BTC, XMR, ZEC
  paymentMethod: varchar("payment_method").notNull(), // 'paypal' | 'cashapp' | 'btc' | 'monero' | 'zcash'
  status: varchar("status").default("pending").notNull(), // 'pending' | 'verified' | 'expired' | 'cancelled'
  verifiedBy: varchar("verified_by"), // Admin user ID who verified
  verifiedAt: timestamp("verified_at"),
  expiresAt: timestamp("expires_at").notNull(), // 7 days from creation
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const questionnaireSessions = pgTable("questionnaire_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  currentQuestionIndex: integer("current_question_index").default(0).notNull(),
  questionOrder: jsonb("question_order").notNull(),
  completed: boolean("completed").default(false).notNull(),
  reviewingDeclined: boolean("reviewing_declined").default(false).notNull(),
  completedAt: timestamp("completed_at"),
  wantsReminder: boolean("wants_reminder").default(false).notNull(),
  isShared: boolean("is_shared").default(false).notNull(),
  shareId: varchar("share_id").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const responses = pgTable("responses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull().references(() => questionnaireSessions.id),
  questionId: integer("question_id").notNull(),
  // Server-side AES-256-GCM encryption (default for all users)
  // The 'answer' field stores the encrypted ciphertext (base64)
  answer: text("answer").notNull(), // Encrypted ciphertext (base64)
  iv: text("iv"), // Initialization vector for AES-256-GCM (base64)
  tag: text("tag"), // Authentication tag for AES-256-GCM (base64)
  salt: text("salt"), // Per-response salt for key derivation (base64)
  encryptionType: varchar("encryption_type").default("server").notNull(), // 'server' | 'client' | 'plaintext' (legacy)
  // For client-side encrypted responses (paid users with Model C encryption)
  encryptedData: text("encrypted_data"), // X25519-encrypted response
  nonce: text("nonce"), // Nonce for client-side encryption
  // Version history for paid users
  version: integer("version").default(1).notNull(),
  previousVersionId: varchar("previous_version_id"), // Reference to previous version
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Gate responses - encrypted landing page questionnaire responses
export const gateResponses = pgTable("gate_responses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").notNull(), // Anonymous session ID initially
  userId: varchar("user_id").references(() => users.id), // Linked after login via magic link
  questionText: text("question_text").notNull(), // Store question text for reference
  questionIndex: integer("question_index").notNull(), // Order in which question was asked (0-3)
  // AES-256-GCM encryption for all gate responses
  answer: text("answer").notNull(), // Encrypted ciphertext (base64)
  iv: text("iv").notNull(), // Initialization vector (base64)
  tag: text("tag").notNull(), // Authentication tag (base64)
  salt: text("salt").notNull(), // Per-response salt (base64)
  skipped: boolean("skipped").default(false).notNull(), // Whether user skipped this question
  createdAt: timestamp("created_at").defaultNow().notNull(),
  linkedAt: timestamp("linked_at"), // When response was linked to user account
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(questionnaireSessions),
}));

export const questionnaireSessionsRelations = relations(questionnaireSessions, ({ one, many }) => ({
  user: one(users, {
    fields: [questionnaireSessions.userId],
    references: [users.id],
  }),
  responses: many(responses),
}));

export const responsesRelations = relations(responses, ({ one }) => ({
  session: one(questionnaireSessions, {
    fields: [responses.sessionId],
    references: [questionnaireSessions.id],
  }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
});

export const insertGateResponseSchema = createInsertSchema(gateResponses).pick({
  sessionId: true,
  userId: true,
  questionText: true,
  questionIndex: true,
  answer: true,
  iv: true,
  tag: true,
  salt: true,
  skipped: true,
});

export const insertMagicLinkSchema = createInsertSchema(magicLinks).pick({
  email: true,
  token: true,
  expiresAt: true,
});

export const insertQuestionnaireSessionSchema = createInsertSchema(questionnaireSessions).pick({
  userId: true,
  questionOrder: true,
});

export const insertResponseSchema = createInsertSchema(responses).pick({
  sessionId: true,
  questionId: true,
  answer: true,
  iv: true,
  tag: true,
  salt: true,
  encryptionType: true,
});

export const insertNewsletterEmailSchema = createInsertSchema(newsletterEmails).pick({
  encryptedEmail: true,
  iv: true,
  tag: true,
  salt: true,
  unsubscribeToken: true,
});

export const insertPaymentCodeSchema = createInsertSchema(paymentCodes).pick({
  code: true,
  userId: true,
  amount: true,
  currency: true,
  paymentMethod: true,
  expiresAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type GateResponse = typeof gateResponses.$inferSelect;
export type InsertGateResponse = z.infer<typeof insertGateResponseSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpsertUser = typeof users.$inferInsert;

export type MagicLink = typeof magicLinks.$inferSelect;
export type InsertMagicLink = z.infer<typeof insertMagicLinkSchema>;

export type QuestionnaireSession = typeof questionnaireSessions.$inferSelect;
export type InsertQuestionnaireSession = z.infer<typeof insertQuestionnaireSessionSchema>;

export type Response = typeof responses.$inferSelect;
export type InsertResponse = z.infer<typeof insertResponseSchema>;

export type NewsletterEmail = typeof newsletterEmails.$inferSelect;
export type InsertNewsletterEmail = z.infer<typeof insertNewsletterEmailSchema>;

export type PaymentCode = typeof paymentCodes.$inferSelect;
export type InsertPaymentCode = z.infer<typeof insertPaymentCodeSchema>;