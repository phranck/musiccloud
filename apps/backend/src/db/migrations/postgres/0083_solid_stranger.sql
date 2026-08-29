CREATE TABLE "vinyl_layouts" (
	"identity_key" text PRIMARY KEY NOT NULL,
	"discogs_release_id" text,
	"layout_data" jsonb,
	"fetched_at" timestamp with time zone NOT NULL
);
