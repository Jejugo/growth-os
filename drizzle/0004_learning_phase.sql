-- Fase 4: Analytics, Rollups, Learnings, Motor de Experimentos

CREATE TYPE "public"."performance_dimension" AS ENUM('channel', 'angle', 'theme', 'segment', 'hook_pattern', 'posting_hour', 'format', 'campaign');--> statement-breakpoint
CREATE TYPE "public"."window_kind" AS ENUM('7d', '28d', 'all');--> statement-breakpoint
CREATE TYPE "public"."learning_kind" AS ENUM('hypothesis', 'learning');--> statement-breakpoint
CREATE TYPE "public"."learning_direction" AS ENUM('increase', 'decrease', 'keep', 'test');--> statement-breakpoint
CREATE TYPE "public"."learning_status" AS ENUM('active', 'superseded', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."experiment_dimension" AS ENUM('hook', 'cta', 'audience', 'channel', 'topic', 'format', 'angle', 'posting_time');--> statement-breakpoint
CREATE TYPE "public"."experiment_primary_metric" AS ENUM('paid', 'activation', 'signup', 'qualified_visit', 'engagement');--> statement-breakpoint
CREATE TYPE "public"."experiment_status" AS ENUM('draft', 'running', 'concluded', 'abandoned');--> statement-breakpoint

-- Rollups de performance por dimensão e janela temporal
CREATE TABLE "performance_rollups" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"dimension" "performance_dimension" NOT NULL,
	"dimension_value" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"window_kind" "window_kind" NOT NULL,
	"posts" integer DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"signups" integer DEFAULT 0 NOT NULL,
	"activations" integer DEFAULT 0 NOT NULL,
	"paid" integer DEFAULT 0 NOT NULL,
	"revenue" numeric(12, 2) DEFAULT '0' NOT NULL,
	"click_rate" numeric(6, 4) DEFAULT '0' NOT NULL,
	"signup_rate" numeric(6, 4) DEFAULT '0' NOT NULL,
	"paid_rate" numeric(6, 4) DEFAULT '0' NOT NULL,
	"sample_sufficient" boolean DEFAULT false NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "performance_rollups_unique" UNIQUE("product_id","dimension","dimension_value","window_kind","window_end")
);
--> statement-breakpoint

-- Aprendizados gerados por IA a partir dos rollups
CREATE TABLE "learnings" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"statement" text NOT NULL,
	"kind" "learning_kind" DEFAULT 'hypothesis' NOT NULL,
	"direction" "learning_direction" NOT NULL,
	"dimension" "performance_dimension" NOT NULL,
	"dimension_value" text NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" numeric(3, 2) DEFAULT '0' NOT NULL,
	"status" "learning_status" DEFAULT 'active' NOT NULL,
	"applied_to_prompt" boolean DEFAULT false NOT NULL,
	"ai_call_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_by" text
);
--> statement-breakpoint

-- Exposições de experimentos (alocação de posts a variantes)
CREATE TABLE "experiment_exposures" (
	"id" text PRIMARY KEY NOT NULL,
	"experiment_id" text NOT NULL,
	"variant_id" text NOT NULL,
	"post_id" text,
	"publication_id" text,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Novas colunas em experiments
ALTER TABLE "experiments" ADD COLUMN "campaign_id" text;--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "hypothesis" text;--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "dimension" text DEFAULT 'angle' NOT NULL;--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "primary_metric" text DEFAULT 'signup' NOT NULL;--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "min_sample_per_variant" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "winner_variant_id" text;--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "conclusion" text;--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "ended_at" timestamp with time zone;--> statement-breakpoint

-- Novas colunas em experiment_variants
ALTER TABLE "experiment_variants" ADD COLUMN "label" text DEFAULT 'A' NOT NULL;--> statement-breakpoint
ALTER TABLE "experiment_variants" ADD COLUMN "spec" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "experiment_variants" ADD COLUMN "posts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "experiment_variants" ADD COLUMN "clicks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "experiment_variants" ADD COLUMN "signups" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "experiment_variants" ADD COLUMN "paid" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

-- Foreign keys
ALTER TABLE "performance_rollups" ADD CONSTRAINT "performance_rollups_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learnings" ADD CONSTRAINT "learnings_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Índices
CREATE INDEX "performance_rollups_product_idx" ON "performance_rollups" USING btree ("product_id","dimension","window_kind");--> statement-breakpoint
CREATE INDEX "learnings_product_idx" ON "learnings" USING btree ("product_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "experiment_exposures_exp_idx" ON "experiment_exposures" USING btree ("experiment_id","assigned_at" DESC NULLS LAST);
