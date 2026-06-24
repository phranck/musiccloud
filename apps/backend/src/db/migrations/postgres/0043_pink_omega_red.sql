CREATE TABLE "cc_albums" (
	"id" text PRIMARY KEY NOT NULL,
	"jamendo_id" text NOT NULL,
	"name" text NOT NULL,
	"cc_artist_id" text,
	"artwork_url" text,
	"release_date" text,
	"zip_url" text,
	"share_url" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cc_artists" (
	"id" text PRIMARY KEY NOT NULL,
	"jamendo_id" text NOT NULL,
	"name" text NOT NULL,
	"image_url" text,
	"website" text,
	"bio" jsonb,
	"share_url" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cc_short_urls" (
	"id" text PRIMARY KEY NOT NULL,
	"cc_track_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cc_tracks" (
	"id" text PRIMARY KEY NOT NULL,
	"jamendo_id" text NOT NULL,
	"title" text NOT NULL,
	"artist_name" text NOT NULL,
	"cc_artist_id" text,
	"album_name" text,
	"cc_album_id" text,
	"artwork_url" text,
	"duration_ms" integer,
	"release_date" text,
	"license_ccurl" text,
	"stream_url" text NOT NULL,
	"download_url" text,
	"download_allowed" integer,
	"waveform" text,
	"share_url" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cc_albums" ADD CONSTRAINT "cc_albums_cc_artist_id_cc_artists_id_fk" FOREIGN KEY ("cc_artist_id") REFERENCES "public"."cc_artists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cc_short_urls" ADD CONSTRAINT "cc_short_urls_cc_track_id_cc_tracks_id_fk" FOREIGN KEY ("cc_track_id") REFERENCES "public"."cc_tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cc_tracks" ADD CONSTRAINT "cc_tracks_cc_artist_id_cc_artists_id_fk" FOREIGN KEY ("cc_artist_id") REFERENCES "public"."cc_artists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cc_tracks" ADD CONSTRAINT "cc_tracks_cc_album_id_cc_albums_id_fk" FOREIGN KEY ("cc_album_id") REFERENCES "public"."cc_albums"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_cc_albums_jamendo_id" ON "cc_albums" USING btree ("jamendo_id");--> statement-breakpoint
CREATE INDEX "idx_cc_albums_cc_artist_id" ON "cc_albums" USING btree ("cc_artist_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_cc_artists_jamendo_id" ON "cc_artists" USING btree ("jamendo_id");--> statement-breakpoint
CREATE INDEX "idx_cc_artists_name" ON "cc_artists" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_cc_short_urls_cc_track_id" ON "cc_short_urls" USING btree ("cc_track_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_cc_short_urls_cc_track_id" ON "cc_short_urls" USING btree ("cc_track_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_cc_tracks_jamendo_id" ON "cc_tracks" USING btree ("jamendo_id");--> statement-breakpoint
CREATE INDEX "idx_cc_tracks_cc_artist_id" ON "cc_tracks" USING btree ("cc_artist_id");--> statement-breakpoint
CREATE INDEX "idx_cc_tracks_cc_album_id" ON "cc_tracks" USING btree ("cc_album_id");--> statement-breakpoint
CREATE INDEX "idx_cc_tracks_title" ON "cc_tracks" USING btree ("title");--> statement-breakpoint
CREATE INDEX "idx_cc_tracks_created_at" ON "cc_tracks" USING btree ("created_at" DESC NULLS LAST);