CREATE TYPE "public"."score_source" AS ENUM('ai_estimate', 'measured');--> statement-breakpoint
CREATE TYPE "public"."segment_status" AS ENUM('active', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'active', 'paused', 'completed');--> statement-breakpoint
CREATE TYPE "public"."theme_status" AS ENUM('active', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "public"."asset_type" AS ENUM('article', 'research', 'dataset', 'chart', 'carousel', 'newsletter', 'none');--> statement-breakpoint
CREATE TYPE "public"."content_angle" AS ENUM('problem', 'solution', 'how_to', 'case_study', 'comparison', 'data_research', 'myth_busting', 'opinion', 'trend', 'story', 'quick_tip', 'deep_dive', 'contrarian', 'authority');--> statement-breakpoint
CREATE TYPE "public"."cta_type" AS ENUM('none', 'soft', 'direct');--> statement-breakpoint
CREATE TYPE "public"."feedback_action" AS ENUM('approved', 'rejected', 'edited');--> statement-breakpoint
CREATE TYPE "public"."fingerprint_kind" AS ENUM('idea', 'hook', 'argument', 'cta');--> statement-breakpoint
CREATE TYPE "public"."idea_status" AS ENUM('proposed', 'approved', 'rejected', 'used');--> statement-breakpoint
CREATE TYPE "public"."post_status" AS ENUM('draft', 'pending_approval', 'approved', 'rejected', 'scheduled', 'published', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."social_channel" AS ENUM('bluesky', 'linkedin', 'reddit', 'blog', 'newsletter');--> statement-breakpoint
CREATE TABLE "audience_segments" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"locations" text[] DEFAULT '{}' NOT NULL,
	"professions" text[] DEFAULT '{}' NOT NULL,
	"seniority" text[] DEFAULT '{}' NOT NULL,
	"interests" text[] DEFAULT '{}' NOT NULL,
	"pain_points" text[] DEFAULT '{}' NOT NULL,
	"keywords" text[] DEFAULT '{}' NOT NULL,
	"audience_fit_score" integer DEFAULT 0 NOT NULL,
	"problem_intensity_score" integer DEFAULT 0 NOT NULL,
	"conversion_potential_score" integer DEFAULT 0 NOT NULL,
	"score_source" "score_source" DEFAULT 'ai_estimate' NOT NULL,
	"status" "segment_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"mission_id" text,
	"name" text NOT NULL,
	"big_idea" text NOT NULL,
	"hypothesis" text NOT NULL,
	"audience_segment_ids" text[] DEFAULT '{}' NOT NULL,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_themes" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"keywords" text[] DEFAULT '{}' NOT NULL,
	"status" "theme_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"idea_id" text NOT NULL,
	"type" "asset_type" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"status" "idea_status" DEFAULT 'proposed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"post_id" text,
	"idea_id" text,
	"action" "feedback_action" NOT NULL,
	"reason" text,
	"edited_from" text,
	"edited_to" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_fingerprints" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"post_id" text,
	"idea_id" text,
	"kind" "fingerprint_kind" NOT NULL,
	"normalized_text" text NOT NULL,
	"hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_ideas" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"theme_id" text NOT NULL,
	"audience_segment_id" text,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"angle" "content_angle" NOT NULL,
	"supporting_facts" jsonb,
	"status" "idea_status" DEFAULT 'proposed' NOT NULL,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiment_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"experiment_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_control" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiments" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_posts" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"idea_id" text NOT NULL,
	"asset_id" text,
	"campaign_id" text NOT NULL,
	"channel" "social_channel" NOT NULL,
	"variant_of" text,
	"hook" text NOT NULL,
	"body" text NOT NULL,
	"cta" text,
	"cta_type" "cta_type" DEFAULT 'none' NOT NULL,
	"link_url" text,
	"media_plan" jsonb,
	"status" "post_status" DEFAULT 'draft' NOT NULL,
	"rejection_reason" text,
	"risk_review" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audience_segments" ADD CONSTRAINT "audience_segments_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_themes" ADD CONSTRAINT "content_themes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_themes" ADD CONSTRAINT "content_themes_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_idea_id_content_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."content_ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_feedback" ADD CONSTRAINT "content_feedback_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_feedback" ADD CONSTRAINT "content_feedback_post_id_social_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."social_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_feedback" ADD CONSTRAINT "content_feedback_idea_id_content_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."content_ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_fingerprints" ADD CONSTRAINT "content_fingerprints_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_fingerprints" ADD CONSTRAINT "content_fingerprints_post_id_social_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."social_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_fingerprints" ADD CONSTRAINT "content_fingerprints_idea_id_content_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."content_ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_ideas" ADD CONSTRAINT "content_ideas_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_ideas" ADD CONSTRAINT "content_ideas_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_ideas" ADD CONSTRAINT "content_ideas_theme_id_content_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."content_themes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_ideas" ADD CONSTRAINT "content_ideas_audience_segment_id_audience_segments_id_fk" FOREIGN KEY ("audience_segment_id") REFERENCES "public"."audience_segments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_variants" ADD CONSTRAINT "experiment_variants_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_idea_id_content_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."content_ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_asset_id_content_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."content_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audience_segments_product_idx" ON "audience_segments" USING btree ("product_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "campaigns_product_idx" ON "campaigns" USING btree ("product_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "content_themes_product_idx" ON "content_themes" USING btree ("product_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "content_assets_product_idx" ON "content_assets" USING btree ("product_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "content_feedback_product_idx" ON "content_feedback" USING btree ("product_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "content_fingerprints_product_idx" ON "content_fingerprints" USING btree ("product_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "content_fingerprints_hash_idx" ON "content_fingerprints" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "content_ideas_product_idx" ON "content_ideas" USING btree ("product_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "experiments_product_idx" ON "experiments" USING btree ("product_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "social_posts_product_idx" ON "social_posts" USING btree ("product_id","created_at" DESC NULLS LAST);