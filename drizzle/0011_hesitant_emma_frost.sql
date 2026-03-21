CREATE TYPE "public"."insurance_artifact_type" AS ENUM('policy_document', 'renewal_notice', 'premium_notice', 'coverage_update', 'claim_update', 'other');--> statement-breakpoint
CREATE TABLE "insurance_artifacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"gmail_connection_id" integer,
	"source_email" varchar(320),
	"gmail_message_id" varchar(128) NOT NULL,
	"provider" varchar(128),
	"insurance_category" "insurance_category_type",
	"artifact_type" "insurance_artifact_type" DEFAULT 'other' NOT NULL,
	"confidence" numeric(4, 3) DEFAULT '0' NOT NULL,
	"premium_amount" numeric(10, 2),
	"policy_number" text,
	"document_date" timestamp,
	"subject" text,
	"summary" text,
	"action_hint" text,
	"attachment_filename" varchar(255),
	"attachment_file_key" text,
	"extracted_data" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "insurance_artifacts_user_id_idx" ON "insurance_artifacts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "insurance_artifacts_category_idx" ON "insurance_artifacts" USING btree ("user_id","insurance_category");--> statement-breakpoint
CREATE INDEX "insurance_artifacts_type_idx" ON "insurance_artifacts" USING btree ("user_id","artifact_type");--> statement-breakpoint
CREATE INDEX "insurance_artifacts_document_date_idx" ON "insurance_artifacts" USING btree ("document_date","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "insurance_artifacts_user_message_uniq" ON "insurance_artifacts" USING btree ("user_id","gmail_message_id");