import { sql, relations } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  timestamp,
  boolean,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
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

// User table for authenticated senders
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").unique().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Magic links for passwordless auth
export const magicLinks = pgTable("magic_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Thank-you messages
export const thankYouMessages = pgTable("thank_you_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Sender fields (userId is set when sender is authenticated)
  userId: varchar("user_id").references(() => users.id),
  senderName: text("sender_name"), // Optional display name
  senderEmail: text("sender_email").notNull(),
  // Recipient fields
  recipientName: text("recipient_name").notNull(),
  recipientEmail: text("recipient_email").notNull(),
  // Message content
  message: text("message").notNull(),
  subject: text("subject"), // Optional custom subject line
  // Delivery status
  delivered: boolean("delivered").default(false).notNull(),
  deliveredAt: timestamp("delivered_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  messages: many(thankYouMessages),
}));

export const thankYouMessagesRelations = relations(
  thankYouMessages,
  ({ one }) => ({
    user: one(users, {
      fields: [thankYouMessages.userId],
      references: [users.id],
    }),
  }),
);

// Insert schemas
export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
});

export const insertMagicLinkSchema = createInsertSchema(magicLinks).pick({
  email: true,
  token: true,
  expiresAt: true,
});

export const insertThankYouMessageSchema = createInsertSchema(
  thankYouMessages,
).pick({
  userId: true,
  senderName: true,
  senderEmail: true,
  recipientName: true,
  recipientEmail: true,
  message: true,
  subject: true,
});

// Public submission schema (no userId required — anyone can send)
export const submitThankYouSchema = z.object({
  senderName: z.string().trim().optional(),
  senderEmail: z.string().email(),
  recipientName: z.string().trim().min(1, "Recipient name is required"),
  recipientEmail: z.string().email("Invalid recipient email"),
  message: z
    .string()
    .trim()
    .min(10, "Message must be at least 10 characters")
    .max(2000, "Message must be 2000 characters or fewer"),
  subject: z.string().trim().max(200).optional(),
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export type MagicLink = typeof magicLinks.$inferSelect;
export type InsertMagicLink = typeof magicLinks.$inferInsert;

export type ThankYouMessage = typeof thankYouMessages.$inferSelect;
export type InsertThankYouMessage = typeof thankYouMessages.$inferInsert;
export type SubmitThankYou = z.infer<typeof submitThankYouSchema>;
