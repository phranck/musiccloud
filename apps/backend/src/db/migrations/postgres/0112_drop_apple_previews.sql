-- Apple Music previews are no longer used (issue #290). The Apple Developer
-- Program License Agreement lets MusicKit content play only as the MusicKit
-- APIs or MusicKit JS render it, and the share page plays previews in its own
-- audio element. The Apple Music adapter stopped returning them; this removes
-- the ones stored before. Deezer supplies the previews, refreshed on demand by
-- the share-preview route.
DELETE FROM "track_previews" WHERE "service" = 'apple-music';
--> statement-breakpoint
DELETE FROM "album_previews" WHERE "service" = 'apple-music';
