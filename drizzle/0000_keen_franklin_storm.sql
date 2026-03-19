CREATE TYPE "public"."analysis_status" AS ENUM('pending', 'processing', 'completed', 'error');--> statement-breakpoint
CREATE TYPE "public"."audit_status" AS ENUM('allowed', 'blocked', 'error');--> statement-breakpoint
CREATE TYPE "public"."chat_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."invoice_category" AS ENUM('תקשורת', 'חשמל', 'מים', 'ארנונה', 'ביטוח', 'בנק', 'רכב', 'אחר');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('pending', 'paid', 'overdue', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."usage_action" AS ENUM('analyze', 'chat');--> statement-breakpoint
CREATE TABLE "analyses" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" varchar(64) NOT NULL,
	"user_id" integer,
	"files" jsonb NOT NULL,
	"extracted_text" text,
	"analysis_result" jsonb,
	"status" "analysis_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "analyses_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "api_usage_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"session_id" varchar(64),
	"action" "usage_action" NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"action" varchar(64) NOT NULL,
	"resource" varchar(64) NOT NULL,
	"resource_id" varchar(128),
	"ip_address" varchar(64),
	"user_agent" text,
	"details" text,
	"status" "audit_status" DEFAULT 'allowed' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" varchar(64) NOT NULL,
	"role" "chat_role" NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gmail_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"email" varchar(320),
	"expires_at" timestamp,
	"last_synced_at" timestamp,
	"last_sync_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smart_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"gmail_connection_id" integer,
	"source_email" varchar(320),
	"gmail_message_id" varchar(128) NOT NULL,
	"provider" varchar(128),
	"category" "invoice_category" DEFAULT 'אחר',
	"amount" numeric(10, 2),
	"invoice_date" timestamp,
	"due_date" timestamp,
	"status" "invoice_status" DEFAULT 'unknown',
	"subject" text,
	"raw_text" text,
	"extracted_data" jsonb,
	"parsed" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"open_id" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"login_method" varchar(64),
	"role" "role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_signed_in" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_open_id_unique" UNIQUE("open_id")
);
--> statement-breakpoint
CREATE INDEX "analyses_user_id_idx" ON "analyses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "usage_user_id_idx" ON "api_usage_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "usage_session_id_idx" ON "api_usage_logs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "usage_created_at_idx" ON "api_usage_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_user_id_idx" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "gmail_user_id_idx" ON "gmail_connections" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gmail_user_email_uniq" ON "gmail_connections" USING btree ("user_id","email");--> statement-breakpoint
CREATE INDEX "invoice_user_id_idx" ON "smart_invoices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invoice_gmail_conn_idx" ON "smart_invoices" USING btree ("gmail_connection_id");--> statement-breakpoint
CREATE INDEX "invoice_gmail_msg_idx" ON "smart_invoices" USING btree ("gmail_message_id");--> statement-breakpoint
CREATE INDEX "invoice_created_at_idx" ON "smart_invoices" USING btree ("created_at");