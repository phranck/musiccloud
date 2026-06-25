-- Custom SQL migration file, put your code below! --

-- Backfill existing `tracks.release_date` to a bare `YYYY-MM-DD`.
--
-- Source services stored release dates in their own formats: YouTube/SoundCloud
-- as an ISO-8601 timestamp (`2009-10-07T23:12:34Z`), Bandcamp as an RFC-2822
-- string (`15 Sep 2025 00:00:00 GMT`). The share response schema validates
-- `releaseDate` as `format: date`; the ingest normalizer keeps new rows clean,
-- this cleans the existing ones so the column holds only bare dates end-to-end.

-- ISO date / timestamp: keep the `YYYY-MM-DD` prefix (no timezone math).
UPDATE "tracks"
   SET "release_date" = substring("release_date" for 10)
 WHERE "release_date" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T';

-- RFC-2822 ("DD Mon YYYY HH:MM:SS GMT", Bandcamp): parse to its UTC `YYYY-MM-DD`.
UPDATE "tracks"
   SET "release_date" = to_char(to_date(substring("release_date" for 11), 'DD Mon YYYY'), 'YYYY-MM-DD')
 WHERE "release_date" LIKE '%T%'
   AND "release_date" !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T';
