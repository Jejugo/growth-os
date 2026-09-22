ALTER TABLE "channel_accounts" ALTER COLUMN "credentials" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "channel_accounts" ADD COLUMN "page_url" text;--> statement-breakpoint
ALTER TABLE "publications" ADD COLUMN "manual_confirmed_at" timestamp with time zone;