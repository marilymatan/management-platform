CREATE TABLE "category_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"provider_pattern" varchar(128) NOT NULL,
	"custom_category" varchar(128) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "smart_invoices" ADD COLUMN "custom_category" varchar(128);--> statement-breakpoint
CREATE UNIQUE INDEX "category_mapping_user_provider_uniq" ON "category_mappings" USING btree ("user_id","provider_pattern");