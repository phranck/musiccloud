CREATE TABLE "artist_profile_refresh_events" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_admin_id" text NOT NULL,
	"artist_entity_id" text NOT NULL,
	"trigger" text DEFAULT 'manual' NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"outcome" text NOT NULL,
	"error_code" text,
	"error_id" text,
	"cause" text,
	CONSTRAINT "chk_artist_profile_refresh_events_trigger" CHECK ("artist_profile_refresh_events"."trigger" IN ('manual')),
	CONSTRAINT "chk_artist_profile_refresh_events_outcome" CHECK ("artist_profile_refresh_events"."outcome" IN ('refreshing', 'succeeded', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "artist_cache" ADD COLUMN "profile_providers" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "artist_profile_refresh_events" ADD CONSTRAINT "artist_profile_refresh_events_actor_admin_id_admin_users_id_fk" FOREIGN KEY ("actor_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artist_profile_refresh_events" ADD CONSTRAINT "artist_profile_refresh_events_artist_entity_id_artist_entities_id_fk" FOREIGN KEY ("artist_entity_id") REFERENCES "public"."artist_entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_artist_profile_refresh_events_entity_occurred" ON "artist_profile_refresh_events" USING btree ("artist_entity_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_artist_profile_refresh_events_actor_occurred" ON "artist_profile_refresh_events" USING btree ("actor_admin_id","occurred_at" DESC NULLS LAST);