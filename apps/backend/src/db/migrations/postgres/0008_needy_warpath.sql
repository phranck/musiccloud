CREATE TABLE "artist_images" (
	"name_key" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"image_url" text NOT NULL,
	"source" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
