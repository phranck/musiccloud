CREATE TABLE "enriched_artists" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"image_url" text,
	"genres" jsonb,
	"bio" text,
	"follower_count" integer,
	"top_tracks" jsonb,
	"upcoming_events" jsonb,
	"profile_updated_at" timestamp with time zone,
	"tracks_updated_at" timestamp with time zone,
	"events_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"original_url" text NOT NULL,
	"short_url" text NOT NULL,
	"media_type" text NOT NULL,
	"track" jsonb,
	"album" jsonb,
	"artist" jsonb,
	"service_links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"artwork_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_type_valid" CHECK ("media_entries"."media_type" IN ('track', 'album', 'artist'))
);
--> statement-breakpoint
CREATE INDEX "idx_enriched_artists_name" ON "enriched_artists" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_enriched_artists_stale" ON "enriched_artists" USING btree ("profile_updated_at" NULLS FIRST);--> statement-breakpoint
CREATE INDEX "idx_media_entries_user_date" ON "media_entries" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_media_entries_user_original_url" ON "media_entries" USING btree ("user_id","original_url");