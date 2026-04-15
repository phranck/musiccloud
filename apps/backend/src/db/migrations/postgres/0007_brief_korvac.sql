CREATE INDEX "idx_album_short_urls_album_id" ON "album_short_urls" USING btree ("album_id");--> statement-breakpoint
CREATE INDEX "idx_albums_created_at" ON "albums" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_artist_short_urls_artist_id" ON "artist_short_urls" USING btree ("artist_id");--> statement-breakpoint
CREATE INDEX "idx_artists_created_at" ON "artists" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_short_urls_track_id" ON "short_urls" USING btree ("track_id");--> statement-breakpoint
CREATE INDEX "idx_tracks_created_at" ON "tracks" USING btree ("created_at" DESC NULLS LAST);