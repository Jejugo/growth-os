CREATE TYPE "public"."attribution_model" AS ENUM('direct', 'last_touch', 'first_touch', 'none');--> statement-breakpoint
CREATE TYPE "public"."growth_event_type" AS ENUM('impression', 'click', 'signup', 'activation', 'paid', 'churn');--> statement-breakpoint
CREATE TABLE "growth_events" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"visitor_id" text,
	"external_user_id" text,
	"event_type" "growth_event_type" NOT NULL,
	"campaign_id" text,
	"post_id" text,
	"publication_id" text,
	"tracking_link_id" text,
	"audience_segment_id" text,
	"channel" text,
	"value" numeric(12, 2),
	"attribution_model" "attribution_model" DEFAULT 'none' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"dedupe_key" text NOT NULL,
	CONSTRAINT "growth_events_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "ingest_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"key_hash" text NOT NULL,
	"name" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracking_links" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"campaign_id" text,
	"post_id" text,
	"publication_id" text,
	"code" text NOT NULL,
	"destination_url" text NOT NULL,
	"generated_url" text NOT NULL,
	"utm_source" text NOT NULL,
	"utm_medium" text NOT NULL,
	"utm_campaign" text NOT NULL,
	"utm_content" text,
	"ref" text NOT NULL,
	"click_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracking_links_code_unique" UNIQUE("code"),
	CONSTRAINT "tracking_links_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
CREATE TABLE "visitors" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"visitor_id" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_tracking_link_id" text,
	"last_tracking_link_id" text,
	"external_user_id" text,
	CONSTRAINT "visitors_product_visitor_unique" UNIQUE("product_id","visitor_id")
);
--> statement-breakpoint
ALTER TABLE "growth_events" ADD CONSTRAINT "growth_events_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingest_keys" ADD CONSTRAINT "ingest_keys_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracking_links" ADD CONSTRAINT "tracking_links_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "growth_events_product_type_idx" ON "growth_events" USING btree ("product_id","event_type","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "tracking_links_product_idx" ON "tracking_links" USING btree ("product_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "visitors_product_idx" ON "visitors" USING btree ("product_id","last_seen_at" DESC NULLS LAST);