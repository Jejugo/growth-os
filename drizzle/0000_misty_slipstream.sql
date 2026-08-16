-- pg_trgm agora: a deduplicação de conteúdo da Fase 1 depende dela, e
-- habilitar extensão numa migration futura, com dados em produção, é um
-- passo a mais sem ganho nenhum.
CREATE EXTENSION IF NOT EXISTS "pg_trgm";--> statement-breakpoint
CREATE TYPE "public"."analysis_status" AS ENUM('never', 'running', 'ok', 'failed');--> statement-breakpoint
CREATE TYPE "public"."page_role" AS ENUM('home', 'pricing', 'features', 'about', 'docs', 'blog', 'other');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('active', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "public"."profile_source" AS ENUM('ai', 'human', 'merged');--> statement-breakpoint
CREATE TYPE "public"."mission_objective" AS ENUM('users', 'signups', 'paid_customers', 'reach', 'followers', 'revenue');--> statement-breakpoint
CREATE TYPE "public"."mission_status" AS ENUM('draft', 'active', 'paused', 'achieved', 'missed');--> statement-breakpoint
CREATE TYPE "public"."ai_call_status" AS ENUM('ok', 'invalid', 'error');--> statement-breakpoint
CREATE TYPE "public"."ai_tier" AS ENUM('cheap', 'standard', 'strong');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('started', 'completed', 'failed', 'retried', 'cancelled');--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"email_verified" timestamp with time zone,
	"image" text,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "product_crawl_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"crawl_batch_id" text NOT NULL,
	"page_url" text NOT NULL,
	"page_role" "page_role" NOT NULL,
	"http_status" integer NOT NULL,
	"title" text,
	"extracted_text" text NOT NULL,
	"content_hash" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "crawl_snapshot_unique" UNIQUE("product_id","page_url","content_hash")
);
--> statement-breakpoint
CREATE TABLE "product_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"version" integer NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"source" "profile_source" NOT NULL,
	"prompt_version" text,
	"crawl_batch_id" text,
	"product_name" text,
	"one_liner" text,
	"primary_problem" text,
	"value_proposition" text,
	"pricing_summary" text,
	"data" jsonb NOT NULL,
	"locked_fields" text[] DEFAULT '{}' NOT NULL,
	"confidence" jsonb,
	"low_confidence" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_profile_version_unique" UNIQUE("product_id","version")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"domain" text NOT NULL,
	"status" "product_status" DEFAULT 'active' NOT NULL,
	"analysis_status" "analysis_status" DEFAULT 'never' NOT NULL,
	"analysis_error" text,
	"last_analyzed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "missions" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"name" text NOT NULL,
	"objective_type" "mission_objective" NOT NULL,
	"target_value" numeric(14, 2) NOT NULL,
	"current_value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"primary_conversion" text,
	"secondary_conversion" text,
	"target_date" timestamp with time zone,
	"status" "mission_status" DEFAULT 'draft' NOT NULL,
	"strategy_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"task" text NOT NULL,
	"prompt_version" text NOT NULL,
	"tier" "ai_tier" NOT NULL,
	"model" text NOT NULL,
	"product_id" text,
	"mission_id" text,
	"campaign_id" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"status" "ai_call_status" NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text,
	"actor" text NOT NULL,
	"decision" text NOT NULL,
	"rationale" text NOT NULL,
	"inputs_snapshot" jsonb,
	"ai_call_id" text,
	"job_run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"task_name" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"product_id" text,
	"status" "job_status" NOT NULL,
	"trigger_run_id" text,
	"input" jsonb,
	"result" jsonb,
	"error" jsonb,
	"attempt" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "job_runs_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_crawl_snapshots" ADD CONSTRAINT "product_crawl_snapshots_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_profiles" ADD CONSTRAINT "product_profiles_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crawl_snapshots_product_idx" ON "product_crawl_snapshots" USING btree ("product_id","fetched_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "product_profiles_current_idx" ON "product_profiles" USING btree ("product_id","is_current");--> statement-breakpoint
CREATE INDEX "products_created_idx" ON "products" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "missions_product_idx" ON "missions" USING btree ("product_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_calls_product_created_idx" ON "ai_calls" USING btree ("product_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "decisions_product_created_idx" ON "decisions" USING btree ("product_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "job_runs_product_started_idx" ON "job_runs" USING btree ("product_id","started_at" DESC NULLS LAST);