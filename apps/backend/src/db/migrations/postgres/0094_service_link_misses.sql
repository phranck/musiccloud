CREATE TABLE "service_link_misses" (
	"id" text PRIMARY KEY NOT NULL,
	"track_id" text NOT NULL,
	"service" text NOT NULL,
	"checked_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_link_misses" ADD CONSTRAINT "service_link_misses_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_service_link_misses_track_service" ON "service_link_misses" USING btree ("track_id","service");