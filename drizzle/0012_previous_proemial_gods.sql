CREATE TYPE "public"."action_item_status" AS ENUM('pending', 'completed', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."action_item_type" AS ENUM('savings', 'renewal', 'gap', 'monitoring');--> statement-breakpoint
CREATE TYPE "public"."priority_level" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."savings_opportunity_status" AS ENUM('open', 'completed', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."savings_opportunity_type" AS ENUM('duplicate', 'overpriced', 'unnecessary', 'gap');--> statement-breakpoint
CREATE TABLE "action_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"action_key" varchar(160) NOT NULL,
	"savings_opportunity_id" integer,
	"type" "action_item_type" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"instructions" jsonb NOT NULL,
	"potential_saving" numeric(10, 2) DEFAULT '0' NOT NULL,
	"priority" "priority_level" DEFAULT 'medium' NOT NULL,
	"status" "action_item_status" DEFAULT 'pending' NOT NULL,
	"due_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "insurance_score_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"score" integer NOT NULL,
	"breakdown" jsonb NOT NULL,
	"total_monthly_spend" numeric(10, 2) DEFAULT '0' NOT NULL,
	"potential_savings" numeric(10, 2) DEFAULT '0' NOT NULL,
	"calculated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"month" varchar(7) NOT NULL,
	"score_at_time" integer NOT NULL,
	"score_change" integer DEFAULT 0 NOT NULL,
	"changes" jsonb NOT NULL,
	"new_actions" jsonb NOT NULL,
	"summary" text NOT NULL,
	"data_hash" varchar(128) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "savings_opportunities" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"opportunity_key" varchar(160) NOT NULL,
	"type" "savings_opportunity_type" NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"monthly_saving" numeric(10, 2) DEFAULT '0' NOT NULL,
	"annual_saving" numeric(10, 2) DEFAULT '0' NOT NULL,
	"priority" "priority_level" DEFAULT 'medium' NOT NULL,
	"action_steps" jsonb NOT NULL,
	"related_session_ids" jsonb NOT NULL,
	"status" "savings_opportunity_status" DEFAULT 'open' NOT NULL,
	"data_hash" varchar(128) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "onboarding_completed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "action_items_user_id_idx" ON "action_items" USING btree ("user_id","status","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "action_items_user_key_uniq" ON "action_items" USING btree ("user_id","action_key");--> statement-breakpoint
CREATE INDEX "insurance_score_history_user_id_idx" ON "insurance_score_history" USING btree ("user_id","calculated_at");--> statement-breakpoint
CREATE INDEX "monthly_reports_user_id_idx" ON "monthly_reports" USING btree ("user_id","month");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_reports_user_month_uniq" ON "monthly_reports" USING btree ("user_id","month");--> statement-breakpoint
CREATE INDEX "savings_opportunities_user_id_idx" ON "savings_opportunities" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "savings_opportunities_user_key_uniq" ON "savings_opportunities" USING btree ("user_id","opportunity_key");