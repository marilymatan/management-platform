CREATE TABLE "gmail_scan_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" varchar(64) NOT NULL,
	"user_id" integer NOT NULL,
	"days_back" integer NOT NULL,
	"clear_existing" boolean DEFAULT false NOT NULL,
	"status" "analysis_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"locked_by" varchar(128),
	"last_heartbeat_at" timestamp,
	"started_at" timestamp,
	"completed_at" timestamp,
	"next_retry_at" timestamp,
	"result" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "gmail_scan_jobs_user_id_idx" ON "gmail_scan_jobs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "gmail_scan_jobs_status_idx" ON "gmail_scan_jobs" USING btree ("status","next_retry_at","created_at");--> statement-breakpoint
CREATE INDEX "gmail_scan_jobs_user_status_idx" ON "gmail_scan_jobs" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "gmail_scan_jobs_job_id_uniq" ON "gmail_scan_jobs" USING btree ("job_id");