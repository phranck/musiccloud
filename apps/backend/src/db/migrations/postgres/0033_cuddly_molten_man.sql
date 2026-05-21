CREATE TABLE "artist_profiles" (
	"artist_entity_id" text PRIMARY KEY NOT NULL,
	"image_url" text,
	"genres" text,
	"source_service" text,
	"source_url" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
INSERT INTO "artist_profiles" (
	"artist_entity_id",
	"image_url",
	"genres",
	"source_service",
	"source_url",
	"created_at",
	"updated_at"
)
SELECT
	"artist_entity_id",
	"image_url",
	"genres",
	"source_service",
	"source_url",
	"created_at",
	"updated_at"
FROM "artists";--> statement-breakpoint
DO $$
BEGIN
	IF (SELECT COUNT(*) FROM "artist_profiles") <> (SELECT COUNT(*) FROM "artists") THEN
		RAISE EXCEPTION 'artist_profiles backfill row count does not match artists';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "artist_profiles" profile
		LEFT JOIN "artist_entities" entity ON entity."id" = profile."artist_entity_id"
		WHERE entity."id" IS NULL
	) THEN
		RAISE EXCEPTION 'artist_profiles contains rows without matching artist_entities after backfill';
	END IF;
END $$;--> statement-breakpoint
DROP TABLE "artists" CASCADE;--> statement-breakpoint
ALTER TABLE "artist_profiles" ADD CONSTRAINT "artist_profiles_artist_entity_id_artist_entities_id_fk" FOREIGN KEY ("artist_entity_id") REFERENCES "public"."artist_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_artist_profiles_source_url" ON "artist_profiles" USING btree ("source_url");--> statement-breakpoint
CREATE INDEX "idx_artist_profiles_created_at" ON "artist_profiles" USING btree ("created_at" DESC NULLS LAST);
