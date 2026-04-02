CREATE TABLE "artist_service_links" (
	"id" text PRIMARY KEY NOT NULL,
	"artist_id" text NOT NULL,
	"service" text NOT NULL,
	"external_id" text,
	"url" text NOT NULL,
	"confidence" real NOT NULL,
	"match_method" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artist_short_urls" (
	"id" text PRIMARY KEY NOT NULL,
	"artist_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artists" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"image_url" text,
	"genres" text,
	"source_service" text,
	"source_url" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artist_service_links" ADD CONSTRAINT "artist_service_links_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_short_urls" ADD CONSTRAINT "artist_short_urls_artist_id_artists_id_fk" FOREIGN KEY ("artist_id") REFERENCES "public"."artists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_artist_service_links_artist_service" ON "artist_service_links" USING btree ("artist_id","service");--> statement-breakpoint
CREATE INDEX "idx_artist_service_links_service_external" ON "artist_service_links" USING btree ("service","external_id");--> statement-breakpoint
CREATE INDEX "idx_artists_name" ON "artists" USING btree ("name");