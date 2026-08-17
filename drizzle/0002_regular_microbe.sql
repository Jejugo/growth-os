CREATE TYPE "public"."attempt_outcome" AS ENUM('success', 'retryable_error', 'permanent_error', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."automation_level" AS ENUM('automatic', 'approval_required', 'suggestions_only');--> statement-breakpoint
CREATE TYPE "public"."channel_account_status" AS ENUM('active', 'paused', 'error', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."distribution_channel" AS ENUM('bluesky', 'linkedin', 'reddit');--> statement-breakpoint
CREATE TYPE "public"."publication_status" AS ENUM('scheduled', 'publishing', 'published', 'failed', 'unknown', 'cancelled');--> statement-breakpoint
CREATE TABLE "automation_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"channel" "distribution_channel" NOT NULL,
	"level" "automation_level" DEFAULT 'approval_required' NOT NULL,
	"max_posts_per_day" integer DEFAULT 2 NOT NULL,
	"min_minutes_between_posts" integer DEFAULT 120 NOT NULL,
	"allowed_hours" jsonb,
	"kill_switch" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_policy_unique" UNIQUE("product_id","channel")
);
--> statement-breakpoint
CREATE TABLE "channel_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"channel" "distribution_channel" NOT NULL,
	"handle" text NOT NULL,
	"display_name" text,
	"credentials" text NOT NULL,
	"credentials_expires_at" timestamp with time zone,
	"status" "channel_account_status" DEFAULT 'active' NOT NULL,
	"last_error_at" timestamp with time zone,
	"last_error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_account_unique" UNIQUE("product_id","channel","handle")
);
--> statement-breakpoint
CREATE TABLE "publication_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"publication_id" text NOT NULL,
	"attempt_no" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"request" jsonb NOT NULL,
	"response_status" integer,
	"response" jsonb,
	"outcome" "attempt_outcome"
);
--> statement-breakpoint
CREATE TABLE "publications" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"post_id" text NOT NULL,
	"channel_account_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "publication_status" DEFAULT 'scheduled' NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone,
	"external_id" text,
	"external_url" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publications_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "rate_limit_state" (
	"channel_account_id" text PRIMARY KEY NOT NULL,
	"window_starts_at" timestamp with time zone NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"backoff_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_config" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"global_kill_switch" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "social_posts" ADD COLUMN "publication_id" text;--> statement-breakpoint
ALTER TABLE "automation_policies" ADD CONSTRAINT "automation_policies_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_accounts" ADD CONSTRAINT "channel_accounts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_attempts" ADD CONSTRAINT "publication_attempts_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_post_id_social_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."social_posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_channel_account_id_channel_accounts_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."channel_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_limit_state" ADD CONSTRAINT "rate_limit_state_channel_account_id_channel_accounts_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."channel_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "publications_product_status_idx" ON "publications" USING btree ("product_id","status","scheduled_for");