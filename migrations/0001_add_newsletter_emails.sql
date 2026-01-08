-- Migration: Add newsletter_emails table with encrypted storage
-- This table stores newsletter email subscriptions encrypted via AES-256-GCM

CREATE TABLE IF NOT EXISTS "newsletter_emails" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "encrypted_email" text NOT NULL,
  "iv" text NOT NULL,
  "tag" text NOT NULL,
  "subscribed" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Create index on subscribed status for faster queries
CREATE INDEX IF NOT EXISTS "idx_newsletter_subscribed" ON "newsletter_emails" ("subscribed");

-- Create index on created_at for chronological queries
CREATE INDEX IF NOT EXISTS "idx_newsletter_created_at" ON "newsletter_emails" ("created_at" DESC);
