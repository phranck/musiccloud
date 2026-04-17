CREATE TABLE "genre_artworks" (
	"genre_key" text PRIMARY KEY NOT NULL,
	"jpeg" "bytea" NOT NULL,
	"accent_color" text NOT NULL,
	"source_cover_url" text,
	"created_at" timestamp with time zone NOT NULL
);
