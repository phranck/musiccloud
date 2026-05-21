CREATE UNIQUE INDEX "uq_album_short_urls_album_id" ON "album_short_urls" USING btree ("album_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_artist_short_urls_entity_id" ON "artist_short_urls" USING btree ("artist_entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_short_urls_track_id" ON "short_urls" USING btree ("track_id");