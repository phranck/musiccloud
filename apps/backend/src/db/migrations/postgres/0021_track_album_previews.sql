CREATE TABLE "album_previews" (
	"id" text PRIMARY KEY NOT NULL,
	"album_id" text NOT NULL,
	"service" text NOT NULL,
	"url" text NOT NULL,
	"expires_at" timestamp with time zone,
	"observed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "track_previews" (
	"id" text PRIMARY KEY NOT NULL,
	"track_id" text NOT NULL,
	"service" text NOT NULL,
	"url" text NOT NULL,
	"expires_at" timestamp with time zone,
	"observed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "album_previews" ADD CONSTRAINT "album_previews_album_id_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_previews" ADD CONSTRAINT "track_previews_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_album_previews_album_service" ON "album_previews" USING btree ("album_id","service");--> statement-breakpoint
CREATE INDEX "idx_album_previews_album" ON "album_previews" USING btree ("album_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_track_previews_track_service" ON "track_previews" USING btree ("track_id","service");--> statement-breakpoint
CREATE INDEX "idx_track_previews_track" ON "track_previews" USING btree ("track_id");
--> statement-breakpoint
-- Backfill from the legacy preview_url columns. Source-service is the
-- best available emitter signal at this point. expires_at is left null
-- here; the application backfills the parsed Deezer expiry on the next
-- write through the new repo helpers. Application-level dual-write
-- keeps `tracks.preview_url` and `albums.preview_url` in sync until
-- migration 0022 drops them.
INSERT INTO "track_previews" ("id", "track_id", "service", "url", "expires_at", "observed_at")
SELECT
  gen_random_uuid()::text,
  "id",
  COALESCE("source_service", 'unknown'),
  "preview_url",
  NULL,
  COALESCE("updated_at", now())
FROM "tracks"
WHERE "preview_url" IS NOT NULL
ON CONFLICT ("track_id", "service") DO NOTHING;
--> statement-breakpoint
INSERT INTO "album_previews" ("id", "album_id", "service", "url", "expires_at", "observed_at")
SELECT
  gen_random_uuid()::text,
  "id",
  COALESCE("source_service", 'unknown'),
  "preview_url",
  NULL,
  COALESCE("updated_at", now())
FROM "albums"
WHERE "preview_url" IS NOT NULL
ON CONFLICT ("album_id", "service") DO NOTHING;
