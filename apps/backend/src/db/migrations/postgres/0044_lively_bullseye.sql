CREATE TABLE "cc_album_short_urls" (
	"id" text PRIMARY KEY NOT NULL,
	"cc_album_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cc_artist_short_urls" (
	"id" text PRIMARY KEY NOT NULL,
	"cc_artist_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cc_album_short_urls" ADD CONSTRAINT "cc_album_short_urls_cc_album_id_cc_albums_id_fk" FOREIGN KEY ("cc_album_id") REFERENCES "public"."cc_albums"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cc_artist_short_urls" ADD CONSTRAINT "cc_artist_short_urls_cc_artist_id_cc_artists_id_fk" FOREIGN KEY ("cc_artist_id") REFERENCES "public"."cc_artists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_cc_album_short_urls_cc_album_id" ON "cc_album_short_urls" USING btree ("cc_album_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_cc_album_short_urls_cc_album_id" ON "cc_album_short_urls" USING btree ("cc_album_id");--> statement-breakpoint
CREATE INDEX "idx_cc_artist_short_urls_cc_artist_id" ON "cc_artist_short_urls" USING btree ("cc_artist_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_cc_artist_short_urls_cc_artist_id" ON "cc_artist_short_urls" USING btree ("cc_artist_id");