CREATE TABLE "track_external_ids" (
	"id" text PRIMARY KEY NOT NULL,
	"track_id" text NOT NULL,
	"id_type" text NOT NULL,
	"id_value" text NOT NULL,
	"source_service" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "album_external_ids" (
	"id" text PRIMARY KEY NOT NULL,
	"album_id" text NOT NULL,
	"id_type" text NOT NULL,
	"id_value" text NOT NULL,
	"source_service" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artist_external_ids" (
	"id" text PRIMARY KEY NOT NULL,
	"artist_id" text NOT NULL,
	"id_type" text NOT NULL,
	"id_value" text NOT NULL,
	"source_service" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "track_external_ids" ADD CONSTRAINT "track_external_ids_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "album_external_ids" ADD CONSTRAINT "album_external_ids_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_external_ids" ADD CONSTRAINT "artist_external_ids_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_track_external_ids_unique" ON "track_external_ids" USING btree ("track_id","id_type","id_value","source_service");--> statement-breakpoint
CREATE INDEX "idx_track_external_ids_lookup" ON "track_external_ids" USING btree ("id_type","id_value");--> statement-breakpoint
CREATE INDEX "idx_track_external_ids_track" ON "track_external_ids" USING btree ("track_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_album_external_ids_unique" ON "album_external_ids" USING btree ("album_id","id_type","id_value","source_service");--> statement-breakpoint
CREATE INDEX "idx_album_external_ids_lookup" ON "album_external_ids" USING btree ("id_type","id_value");--> statement-breakpoint
CREATE INDEX "idx_album_external_ids_album" ON "album_external_ids" USING btree ("album_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_artist_external_ids_unique" ON "artist_external_ids" USING btree ("artist_id","id_type","id_value","source_service");--> statement-breakpoint
CREATE INDEX "idx_artist_external_ids_lookup" ON "artist_external_ids" USING btree ("id_type","id_value");--> statement-breakpoint
CREATE INDEX "idx_artist_external_ids_artist" ON "artist_external_ids" USING btree ("artist_id");
