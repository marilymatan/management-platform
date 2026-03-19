CREATE TYPE "public"."employment_status" AS ENUM('salaried', 'self_employed', 'business_owner', 'student', 'retired', 'unemployed');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('male', 'female', 'other');--> statement-breakpoint
CREATE TYPE "public"."income_range" AS ENUM('below_5k', '5k_10k', '10k_15k', '15k_25k', '25k_40k', 'above_40k');--> statement-breakpoint
CREATE TYPE "public"."marital_status" AS ENUM('single', 'married', 'divorced', 'widowed');--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"date_of_birth" timestamp,
	"gender" "gender",
	"marital_status" "marital_status",
	"number_of_children" integer DEFAULT 0,
	"children_ages" text,
	"employment_status" "employment_status",
	"income_range" "income_range",
	"owns_apartment" boolean DEFAULT false,
	"has_active_mortgage" boolean DEFAULT false,
	"number_of_vehicles" integer DEFAULT 0,
	"has_extreme_sports" boolean DEFAULT false,
	"has_special_health_conditions" boolean DEFAULT false,
	"health_conditions_details" text,
	"has_pets" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE INDEX "profile_user_id_idx" ON "user_profiles" USING btree ("user_id");