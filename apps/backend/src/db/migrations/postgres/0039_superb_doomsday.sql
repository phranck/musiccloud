ALTER TABLE "analytics_events" ADD COLUMN IF NOT EXISTS "browser_version" text;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD COLUMN IF NOT EXISTS "os_version" text;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD COLUMN IF NOT EXISTS "device_brand" text;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD COLUMN IF NOT EXISTS "device_model_code" text;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD COLUMN IF NOT EXISTS "is_bot" boolean;--> statement-breakpoint
ALTER TABLE "analytics_events" ALTER COLUMN "is_bot" SET DEFAULT false;--> statement-breakpoint
UPDATE "analytics_events" SET "is_bot" = false WHERE "is_bot" IS NULL;--> statement-breakpoint
ALTER TABLE "analytics_events" ALTER COLUMN "is_bot" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD COLUMN IF NOT EXISTS "bot_name" text;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD COLUMN IF NOT EXISTS "bot_category" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_analytics_events_bot_occurred" ON "analytics_events" USING btree ("is_bot","occurred_at" DESC NULLS LAST);
