ALTER TABLE "cc_tracks" ADD COLUMN "album_position" integer;--> statement-breakpoint
ALTER TABLE "cc_tracks" ADD COLUMN "artist_top_position" integer;--> statement-breakpoint
ALTER TABLE "cc_tracks" ADD COLUMN "music_info" jsonb;--> statement-breakpoint
ALTER TABLE "cc_tracks" ADD COLUMN "stats" jsonb;--> statement-breakpoint
ALTER TABLE "cc_tracks" ADD COLUMN "pro_licensing" integer;--> statement-breakpoint
ALTER TABLE "cc_tracks" ADD COLUMN "pro_url" text;