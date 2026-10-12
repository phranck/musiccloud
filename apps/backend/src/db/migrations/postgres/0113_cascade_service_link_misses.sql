ALTER TABLE "service_link_misses" DROP CONSTRAINT "service_link_misses_track_id_tracks_id_fk";
--> statement-breakpoint
ALTER TABLE "service_link_misses" ADD CONSTRAINT "service_link_misses_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;