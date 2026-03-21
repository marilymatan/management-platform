ALTER TABLE "analyses" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "locked_by" varchar(128);--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "last_heartbeat_at" timestamp;--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "started_at" timestamp;--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "next_retry_at" timestamp;--> statement-breakpoint
CREATE INDEX "analyses_status_idx" ON "analyses" USING btree ("status","next_retry_at","created_at");