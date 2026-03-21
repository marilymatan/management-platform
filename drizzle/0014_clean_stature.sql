ALTER TABLE "analyses" ADD COLUMN "processed_file_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "active_batch_file_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "email_scan_senders" text;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "email_scan_keywords" text;