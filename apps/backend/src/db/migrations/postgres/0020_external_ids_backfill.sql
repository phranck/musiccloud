-- Backfill canonical tracks.isrc and albums.upc into the new
-- external-ids aggregation tables so the historical data is
-- queryable through the same path as future cross-service
-- observations. Manual migration (no Drizzle-kit equivalent
-- because the work is data-only).
--
-- Idempotent: ON CONFLICT DO NOTHING targets the unique index columns
-- created in 0019. Note: ON CONFLICT ON CONSTRAINT requires a UNIQUE
-- CONSTRAINT, NOT a UNIQUE INDEX — Postgres rejects the latter with
-- "constraint does not exist". Column inference works for both.

INSERT INTO "track_external_ids" ("id", "track_id", "id_type", "id_value", "source_service", "observed_at")
SELECT
  gen_random_uuid()::text,
  "id",
  'isrc',
  "isrc",
  COALESCE("source_service", 'unknown'),
  "created_at"
FROM "tracks"
WHERE "isrc" IS NOT NULL
ON CONFLICT ("track_id", "id_type", "id_value", "source_service") DO NOTHING;
--> statement-breakpoint
INSERT INTO "album_external_ids" ("id", "album_id", "id_type", "id_value", "source_service", "observed_at")
SELECT
  gen_random_uuid()::text,
  "id",
  'upc',
  "upc",
  COALESCE("source_service", 'unknown'),
  "created_at"
FROM "albums"
WHERE "upc" IS NOT NULL
ON CONFLICT ("album_id", "id_type", "id_value", "source_service") DO NOTHING;
