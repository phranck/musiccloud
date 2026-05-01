-- Force re-fetch of artist_cache rows whose top_tracks payload was
-- written by the Last.fm fallback (signature: serialised JSON contains
-- a last.fm URL in the misnamed deezerUrl field). Setting
-- tracks_updated_at to a sentinel timestamp far in the past makes the
-- standard 7-day staleness check trigger on the next read; the new
-- per-track Deezer search enrichment then fills in the missing
-- artworkUrl/albumName/durationMs/deezerUrl.
UPDATE "artist_cache"
SET "tracks_updated_at" = '1970-01-01 00:00:00+00'
WHERE "top_tracks" LIKE '%last.fm%';
