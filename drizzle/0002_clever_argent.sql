CREATE TYPE "public"."insurance_category_type" AS ENUM('health', 'life', 'car', 'home');--> statement-breakpoint
ALTER TABLE "analyses" ADD COLUMN "insurance_category" "insurance_category_type";