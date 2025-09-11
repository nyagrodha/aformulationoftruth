CREATE TABLE "auth_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"ip_data" jsonb,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"timezone" text,
	"from_path" text,
	"success" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "questionnaire_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"question_order" jsonb,
	"current_question_index" integer DEFAULT 0,
	"completed" boolean DEFAULT false,
	"completed_at" timestamp,
	"wants_reminder" boolean DEFAULT false,
	"is_shared" boolean DEFAULT false,
	"share_id" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text,
	"question_id" integer,
	"answer" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"name" text,
	"created_at" timestamp DEFAULT now(),
	"completion_count" integer DEFAULT 0,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "auth_events" ADD CONSTRAINT "auth_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questionnaire_sessions" ADD CONSTRAINT "questionnaire_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "responses" ADD CONSTRAINT "responses_session_id_questionnaire_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."questionnaire_sessions"("id") ON DELETE no action ON UPDATE no action;