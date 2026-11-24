-- Napster no longer exists as a service (issue #627), so nothing reads its
-- links, previews, cached misses or plugin state (issue #1212). Tracks,
-- albums and artist profiles first resolved from Napster stay, because the
-- other services' links and the share pages cascade from them.
DELETE FROM "service_links" WHERE "service" = 'napster';
--> statement-breakpoint
DELETE FROM "album_service_links" WHERE "service" = 'napster';
--> statement-breakpoint
DELETE FROM "artist_service_links" WHERE "service" = 'napster';
--> statement-breakpoint
DELETE FROM "track_previews" WHERE "service" = 'napster';
--> statement-breakpoint
DELETE FROM "album_previews" WHERE "service" = 'napster';
--> statement-breakpoint
DELETE FROM "service_link_misses" WHERE "service" = 'napster';
--> statement-breakpoint
DELETE FROM "service_plugins" WHERE "id" = 'napster';
