ALTER TABLE "artist_external_ids" RENAME COLUMN "artist_id" TO "artist_entity_id";--> statement-breakpoint
ALTER TABLE "artist_service_links" RENAME COLUMN "artist_id" TO "artist_entity_id";--> statement-breakpoint
ALTER TABLE "artist_short_urls" RENAME COLUMN "artist_id" TO "artist_entity_id";--> statement-breakpoint
ALTER TABLE "artist_external_ids" DROP CONSTRAINT "artist_external_ids_artist_id_artists_id_fk";
--> statement-breakpoint
ALTER TABLE "artist_service_links" DROP CONSTRAINT "artist_service_links_artist_id_artists_id_fk";
--> statement-breakpoint
ALTER TABLE "artist_short_urls" DROP CONSTRAINT "artist_short_urls_artist_id_artists_id_fk";
--> statement-breakpoint
DROP INDEX "idx_artist_external_ids_artist";--> statement-breakpoint
DROP INDEX "idx_artist_service_links_artist_service";--> statement-breakpoint
DROP INDEX "idx_artist_short_urls_artist_id";--> statement-breakpoint
DROP INDEX "idx_artist_external_ids_unique";--> statement-breakpoint
UPDATE "artist_external_ids" target
SET "artist_entity_id" = source."artist_entity_id"
FROM "artists" source
WHERE target."artist_entity_id" = source."id";--> statement-breakpoint
UPDATE "artist_service_links" target
SET "artist_entity_id" = source."artist_entity_id"
FROM "artists" source
WHERE target."artist_entity_id" = source."id";--> statement-breakpoint
UPDATE "artist_short_urls" target
SET "artist_entity_id" = source."artist_entity_id"
FROM "artists" source
WHERE target."artist_entity_id" = source."id";--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "artist_external_ids" target
    LEFT JOIN "artist_entities" entity ON entity."id" = target."artist_entity_id"
    WHERE entity."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'artist_external_ids contains rows without matching artist_entities after artist_entity_id backfill';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "artist_service_links" target
    LEFT JOIN "artist_entities" entity ON entity."id" = target."artist_entity_id"
    WHERE entity."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'artist_service_links contains rows without matching artist_entities after artist_entity_id backfill';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "artist_short_urls" target
    LEFT JOIN "artist_entities" entity ON entity."id" = target."artist_entity_id"
    WHERE entity."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'artist_short_urls contains rows without matching artist_entities after artist_entity_id backfill';
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "artist_external_ids" ADD CONSTRAINT "artist_external_ids_artist_entity_id_artist_entities_id_fk" FOREIGN KEY ("artist_entity_id") REFERENCES "public"."artist_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_service_links" ADD CONSTRAINT "artist_service_links_artist_entity_id_artist_entities_id_fk" FOREIGN KEY ("artist_entity_id") REFERENCES "public"."artist_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_short_urls" ADD CONSTRAINT "artist_short_urls_artist_entity_id_artist_entities_id_fk" FOREIGN KEY ("artist_entity_id") REFERENCES "public"."artist_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_artist_external_ids_entity" ON "artist_external_ids" USING btree ("artist_entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_artist_service_links_entity_service" ON "artist_service_links" USING btree ("artist_entity_id","service");--> statement-breakpoint
CREATE INDEX "idx_artist_short_urls_entity_id" ON "artist_short_urls" USING btree ("artist_entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_artist_external_ids_unique" ON "artist_external_ids" USING btree ("artist_entity_id","id_type","id_value","source_service");
