CREATE TABLE "album_images" (
	"lookup_key" text PRIMARY KEY NOT NULL,
	"artist_name" text NOT NULL,
	"album_title" text NOT NULL,
	"image_url" text NOT NULL,
	"source" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "track_images" (
	"lookup_key" text PRIMARY KEY NOT NULL,
	"artist_name" text NOT NULL,
	"track_title" text NOT NULL,
	"image_url" text NOT NULL,
	"source" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
