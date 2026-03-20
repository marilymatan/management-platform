CREATE TABLE "category_summary_cache" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"category" "insurance_category_type" NOT NULL,
	"summary_data" text NOT NULL,
	"data_hash" varchar(128) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "category_summary_cache_user_category_uniq" ON "category_summary_cache" USING btree ("user_id","category");--> statement-breakpoint
CREATE INDEX "category_summary_cache_user_id_idx" ON "category_summary_cache" USING btree ("user_id");