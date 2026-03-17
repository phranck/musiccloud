CREATE TABLE "admin_users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "admin_users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "album_service_links" (
	"id" text PRIMARY KEY NOT NULL,
	"album_id" text NOT NULL,
	"service" text NOT NULL,
	"external_id" text,
	"url" text NOT NULL,
	"confidence" real NOT NULL,
	"match_method" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "album_short_urls" (
	"id" text PRIMARY KEY NOT NULL,
	"album_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "albums" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"artists" text NOT NULL,
	"release_date" text,
	"total_tracks" integer,
	"artwork_url" text,
	"label" text,
	"upc" text,
	"source_service" text,
	"source_url" text,
	"preview_url" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artist_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"artist_name" text NOT NULL,
	"profile" text,
	"top_tracks" text,
	"events" text,
	"profile_updated_at" timestamp with time zone,
	"tracks_updated_at" timestamp with time zone,
	"events_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "featured_albums" (
	"id" text PRIMARY KEY NOT NULL,
	"album_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "featured_albums_album_id_unique" UNIQUE("album_id")
);
--> statement-breakpoint
CREATE TABLE "featured_tracks" (
	"id" text PRIMARY KEY NOT NULL,
	"track_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "featured_tracks_track_id_unique" UNIQUE("track_id")
);
--> statement-breakpoint
CREATE TABLE "service_links" (
	"id" text PRIMARY KEY NOT NULL,
	"track_id" text NOT NULL,
	"service" text NOT NULL,
	"external_id" text,
	"url" text NOT NULL,
	"confidence" real NOT NULL,
	"match_method" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "short_urls" (
	"id" text PRIMARY KEY NOT NULL,
	"track_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracks" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"artists" text NOT NULL,
	"album_name" text,
	"isrc" text,
	"artwork_url" text,
	"duration_ms" integer,
	"release_date" text,
	"is_explicit" integer,
	"preview_url" text,
	"source_service" text,
	"source_url" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "url_aliases" (
	"id" text PRIMARY KEY NOT NULL,
	"short_id" text NOT NULL,
	"track_id" text,
	"album_id" text,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "url_aliases_short_id_unique" UNIQUE("short_id")
);
--> statement-breakpoint
ALTER TABLE "album_service_links" ADD CONSTRAINT "album_service_links_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "album_short_urls" ADD CONSTRAINT "album_short_urls_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "featured_albums" ADD CONSTRAINT "featured_albums_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "featured_tracks" ADD CONSTRAINT "featured_tracks_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_links" ADD CONSTRAINT "service_links_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "short_urls" ADD CONSTRAINT "short_urls_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "url_aliases" ADD CONSTRAINT "url_aliases_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "url_aliases" ADD CONSTRAINT "url_aliases_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_album_service_links_album_service" ON "album_service_links" USING btree ("album_id","service");--> statement-breakpoint
CREATE INDEX "idx_album_service_links_service_external" ON "album_service_links" USING btree ("service","external_id");--> statement-breakpoint
CREATE INDEX "idx_albums_upc" ON "albums" USING btree ("upc");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_service_links_track_service" ON "service_links" USING btree ("track_id","service");--> statement-breakpoint
CREATE INDEX "idx_service_links_service_external" ON "service_links" USING btree ("service","external_id");--> statement-breakpoint
CREATE INDEX "idx_tracks_isrc" ON "tracks" USING btree ("isrc");