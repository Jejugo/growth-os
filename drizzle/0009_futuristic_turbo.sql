CREATE TABLE "landing_page_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"files" jsonb NOT NULL,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "landing_page_drafts_product_unique" UNIQUE("product_id")
);
--> statement-breakpoint
ALTER TABLE "landing_page_drafts" ADD CONSTRAINT "landing_page_drafts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;