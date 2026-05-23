ALTER TABLE "analytics_events" ADD COLUMN "browser_version" text;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD COLUMN "os_version" text;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD COLUMN "device_brand" text;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD COLUMN "device_model_code" text;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD COLUMN "is_bot" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD COLUMN "bot_name" text;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD COLUMN "bot_category" text;--> statement-breakpoint
CREATE INDEX "idx_analytics_events_bot_occurred" ON "analytics_events" USING btree ("is_bot","occurred_at" DESC NULLS LAST);