CREATE TYPE "public"."invoice_flow_direction" AS ENUM('expense', 'income', 'unknown');--> statement-breakpoint
ALTER TABLE "smart_invoices" ADD COLUMN "flow_direction" "invoice_flow_direction" DEFAULT 'expense' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "business_name" text;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "business_tax_id" text;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "business_email_domains" text;