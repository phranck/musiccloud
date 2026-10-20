CREATE TABLE "album_short_url_aliases" (
	"id" text PRIMARY KEY NOT NULL,
	"album_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "track_short_url_aliases" (
	"id" text PRIMARY KEY NOT NULL,
	"track_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "album_short_url_aliases" ADD CONSTRAINT "album_short_url_aliases_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_short_url_aliases" ADD CONSTRAINT "track_short_url_aliases_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_album_short_url_aliases_album_id" ON "album_short_url_aliases" USING btree ("album_id");--> statement-breakpoint
CREATE INDEX "idx_track_short_url_aliases_track_id" ON "track_short_url_aliases" USING btree ("track_id");