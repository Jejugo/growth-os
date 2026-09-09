CREATE TYPE "public"."landing_page_status" AS ENUM('generating', 'ready', 'blocked', 'failed');--> statement-breakpoint
CREATE TABLE "landing_pages" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"status" "landing_page_status" DEFAULT 'generating' NOT NULL,
	"slug" text NOT NULL,
	"copy" jsonb,
	"html" text,
	"risk_review" jsonb,
	"vercel_project_id" text,
	"vercel_deployment_id" text,
	"deploy_url" text,
	"ai_call_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waitlist_signups" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"email" text NOT NULL,
	"visitor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_signups_product_email_unique" UNIQUE("product_id","email")
);
--> statement-breakpoint
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_signups" ADD CONSTRAINT "waitlist_signups_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "landing_pages_product_idx" ON "landing_pages" USING btree ("product_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "waitlist_signups_product_idx" ON "waitlist_signups" USING btree ("product_id","created_at" DESC NULLS LAST);