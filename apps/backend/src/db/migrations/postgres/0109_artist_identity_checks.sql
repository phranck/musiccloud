CREATE TABLE "artist_identity_checks" (
	"artist_entity_id" text NOT NULL,
	"provider" text NOT NULL,
	"outcome" text NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	CONSTRAINT "pk_artist_identity_checks" PRIMARY KEY("artist_entity_id","provider"),
	CONSTRAINT "chk_artist_identity_checks_outcome" CHECK ("artist_identity_checks"."outcome" IN ('matched', 'no_match', 'conflict', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "artist_identity_checks" ADD CONSTRAINT "artist_identity_checks_artist_entity_id_artist_entities_id_fk" FOREIGN KEY ("artist_entity_id") REFERENCES "public"."artist_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_artist_identity_checks_due" ON "artist_identity_checks" USING btree ("provider","checked_at");