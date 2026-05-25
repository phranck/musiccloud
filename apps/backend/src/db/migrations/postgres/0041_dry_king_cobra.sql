CREATE EXTENSION IF NOT EXISTS "pg_trgm";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_album_artist_credits_credit_name_trgm" ON "album_artist_credits" USING gin ("credit_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_albums_source_url" ON "albums" USING btree ("source_url") WHERE "albums"."source_url" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_albums_updated_at" ON "albums" USING btree ("updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_albums_title" ON "albums" USING btree ("title");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_albums_title_trgm" ON "albums" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_artist_cache_updated_at" ON "artist_cache" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_artist_entity_names_lower_name" ON "artist_entity_names" USING btree (lower("name"),"artist_entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_artist_entity_names_name_trgm" ON "artist_entity_names" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_artist_entity_names_entity_lower_type" ON "artist_entity_names" USING btree ("artist_entity_id",lower("name"),"name_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_artist_profiles_updated_at" ON "artist_profiles" USING btree ("updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_content_pages_status_title" ON "content_pages" USING btree ("status","title");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_content_pages_position_created" ON "content_pages" USING btree ("position","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_crawl_runs_started_at" ON "crawl_runs" USING btree ("started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_nav_items_nav_position" ON "nav_items" USING btree ("nav_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_page_segments_owner_position" ON "page_segments" USING btree ("owner_slug","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_track_artist_credits_credit_name_trgm" ON "track_artist_credits" USING gin ("credit_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tracks_source_url" ON "tracks" USING btree ("source_url") WHERE "tracks"."source_url" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tracks_updated_at" ON "tracks" USING btree ("updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tracks_title" ON "tracks" USING btree ("title");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tracks_title_trgm" ON "tracks" USING gin ("title" gin_trgm_ops);