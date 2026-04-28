-- Backfill canonical tracks.isrc and albums.upc into the new
-- external-ids aggregation tables so the historical data is
-- queryable through the same path as future cross-service
-- observations. Manual migration (no Drizzle-kit equivalent
-- because the work is data-only).
--
-- Idempotent: ON CONFLICT DO NOTHING relies on the unique index
-- (entity_id, id_type, id_value, source_service) created in 0019.

INSERT INTO "track_external_ids" ("id", "track_id", "id_type", "id_value", "source_service", "observed_at")
SELECT
  encode(gen_random_bytes(12), 'hex'),
  "id",
  'isrc',
  "isrc",
  COALESCE("source_service", 'unknown'),
  "created_at"
FROM "tracks"
WHERE "isrc" IS NOT NULL
ON CONFLICT ON CONSTRAINT "idx_track_external_ids_unique" DO NOTHING;
--> statement-breakpoint
INSERT INTO "album_external_ids" ("id", "album_id", "id_type", "id_value", "source_service", "observed_at")
SELECT
  encode(gen_random_bytes(12), 'hex'),
  "id",
  'upc',
  "upc",
  COALESCE("source_service", 'unknown'),
  "created_at"
FROM "albums"
WHERE "upc" IS NOT NULL
ON CONFLICT ON CONSTRAINT "idx_album_external_ids_unique" DO NOTHING;
