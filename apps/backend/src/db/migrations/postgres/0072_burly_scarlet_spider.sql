CREATE TABLE "album_vinyl_layouts" (
	"id" text PRIMARY KEY NOT NULL,
	"album_id" text NOT NULL,
	"discogs_release_id" text,
	"layout_data" jsonb,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "album_vinyl_layouts" ADD CONSTRAINT "album_vinyl_layouts_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_album_vinyl_layouts_album_id" ON "album_vinyl_layouts" USING btree ("album_id");