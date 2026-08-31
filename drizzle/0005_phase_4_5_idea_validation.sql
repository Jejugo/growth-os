CREATE TYPE "public"."product_stage" AS ENUM('idea', 'validating', 'building', 'launched');--> statement-breakpoint
CREATE TYPE "public"."stage_actor" AS ENUM('human', 'system');--> statement-breakpoint
CREATE TYPE "public"."validation_status" AS ENUM('draft', 'running', 'concluded', 'aborted');--> statement-breakpoint
CREATE TYPE "public"."validation_verdict" AS ENUM('build', 'pivot', 'kill', 'inconclusive');--> statement-breakpoint
CREATE TABLE "product_briefs" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"problem" text NOT NULL,
	"audience" text NOT NULL,
	"solution_sketch" text NOT NULL,
	"why_now" text,
	"alternatives" text,
	"riskiest_assumption" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_stage_events" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"from_stage" "product_stage",
	"to_stage" "product_stage" NOT NULL,
	"actor" "stage_actor" NOT NULL,
	"reason" text,
	"validation_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "validations" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"brief_id" text NOT NULL,
	"campaign_id" text,
	"content_theme_id" text,
	"experiment_id" text,
	"hypothesis" text NOT NULL,
	"landing_url" text NOT NULL,
	"status" "validation_status" DEFAULT 'draft' NOT NULL,
	"started_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"min_visitors" integer DEFAULT 300 NOT NULL,
	"min_signups" integer DEFAULT 100 NOT NULL,
	"min_signup_rate" numeric(5, 4) DEFAULT '0.0400' NOT NULL,
	"min_strong_signals" integer DEFAULT 5 NOT NULL,
	"verdict" "validation_verdict",
	"verdict_reason" text,
	"pivot_suggestions" text[],
	"verdict_at" timestamp with time zone,
	"ai_call_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "experiments_product_idx";--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "domain" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "experiment_variants" ALTER COLUMN "posts" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "experiment_variants" ALTER COLUMN "clicks" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "experiment_variants" ALTER COLUMN "signups" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "experiment_variants" ALTER COLUMN "paid" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "experiments" ALTER COLUMN "min_sample_per_variant" SET DEFAULT 100;--> statement-breakpoint
ALTER TABLE "performance_rollups" ALTER COLUMN "posts" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "performance_rollups" ALTER COLUMN "impressions" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "performance_rollups" ALTER COLUMN "clicks" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "performance_rollups" ALTER COLUMN "signups" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "performance_rollups" ALTER COLUMN "activations" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "performance_rollups" ALTER COLUMN "paid" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "performance_rollups" ALTER COLUMN "revenue" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "performance_rollups" ALTER COLUMN "click_rate" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "performance_rollups" ALTER COLUMN "signup_rate" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "performance_rollups" ALTER COLUMN "paid_rate" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "performance_rollups" ALTER COLUMN "sample_sufficient" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "learnings" ALTER COLUMN "confidence" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "learnings" ALTER COLUMN "applied_to_prompt" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "stage" "product_stage" DEFAULT 'launched' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_briefs" ADD CONSTRAINT "product_briefs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_stage_events" ADD CONSTRAINT "product_stage_events_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_stage_events" ADD CONSTRAINT "product_stage_events_validation_id_validations_id_fk" FOREIGN KEY ("validation_id") REFERENCES "public"."validations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validations" ADD CONSTRAINT "validations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validations" ADD CONSTRAINT "validations_brief_id_product_briefs_id_fk" FOREIGN KEY ("brief_id") REFERENCES "public"."product_briefs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validations" ADD CONSTRAINT "validations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validations" ADD CONSTRAINT "validations_content_theme_id_content_themes_id_fk" FOREIGN KEY ("content_theme_id") REFERENCES "public"."content_themes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validations" ADD CONSTRAINT "validations_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_briefs_product_idx" ON "product_briefs" USING btree ("product_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "product_stage_events_product_idx" ON "product_stage_events" USING btree ("product_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "validations_product_idx" ON "validations" USING btree ("product_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "validations_status_idx" ON "validations" USING btree ("status","ends_at");--> statement-breakpoint
CREATE INDEX "experiments_product_idx" ON "experiments" USING btree ("product_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "experiments" DROP COLUMN "description";--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_url_domain_stage_check" CHECK (("products"."stage" = 'idea') OR ("products"."url" IS NOT NULL AND "products"."domain" IS NOT NULL));