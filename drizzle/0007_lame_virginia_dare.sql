CREATE TYPE "public"."document_manual_type" AS ENUM('insurance', 'money', 'health', 'education', 'family', 'other');--> statement-breakpoint
CREATE TYPE "public"."document_source_type" AS ENUM('analysis_file', 'invoice_pdf');--> statement-breakpoint
CREATE TYPE "public"."family_member_relation" AS ENUM('spouse', 'child', 'parent', 'dependent', 'other');--> statement-breakpoint
CREATE TABLE "document_classifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"document_key" varchar(191) NOT NULL,
	"source_type" "document_source_type" NOT NULL,
	"source_id" varchar(128),
	"manual_type" "document_manual_type" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"full_name" text NOT NULL,
	"relation" "family_member_relation" NOT NULL,
	"birth_date" timestamp,
	"age_label" text,
	"gender" "gender",
	"allergies" text,
	"medical_notes" text,
	"activities" text,
	"insurance_notes" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "document_classifications_user_id_idx" ON "document_classifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "document_classifications_source_idx" ON "document_classifications" USING btree ("user_id","source_type","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_classifications_user_document_uniq" ON "document_classifications" USING btree ("user_id","document_key");--> statement-breakpoint
CREATE INDEX "family_members_user_id_idx" ON "family_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "family_members_relation_idx" ON "family_members" USING btree ("relation");