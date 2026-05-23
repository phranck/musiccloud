ALTER TABLE "analytics_events" ADD COLUMN "geo_country_code" text;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD COLUMN "geo_region_code" text;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD COLUMN "geo_region_name" text;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD COLUMN "geo_city" text;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD COLUMN "geo_latitude" real;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD COLUMN "geo_longitude" real;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD COLUMN "geo_accuracy_radius_km" integer;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD COLUMN "geo_time_zone" text;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD COLUMN "geo_provider" text;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD COLUMN "geo_database_build_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_analytics_events_geo_country_occurred" ON "analytics_events" USING btree ("geo_country_code","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_analytics_events_geo_city_occurred" ON "analytics_events" USING btree ("geo_city","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_analytics_events_geo_recent" ON "analytics_events" USING btree ("occurred_at" DESC NULLS LAST,"geo_country_code","geo_city");