-- Brings every stored album release date into the form `normalizeReleaseDate`
-- in `apps/backend/src/lib/release-date.ts` writes.
--
-- Album writes stored the date a source reported, so a row can hold an
-- RFC-2822 timestamp such as `17 Mar 2026 00:00:00 GMT`, an ISO timestamp, a
-- date that does not exist, a bare year or a year and month. The resolve
-- response and the share page read every value through the normalizer, so
-- what changes here is the stored value the cross-service album search takes
-- its year from.
--
-- A value with a date prefix keeps the prefix when it is a real calendar date
-- and is cleared when it is not. A bare year and a year and month are cleared,
-- because they name no day. Anything else is read as a timestamp and reduced
-- to its UTC date. A value PostgreSQL cannot read as a timestamp is left as it
-- is rather than cleared, because the normalizer reads it at every read path
-- and a format it knows and PostgreSQL does not would otherwise be lost. Each
-- row is converted on its own, so one unreadable value cannot stop the
-- migration, and only a row whose value changes is written.
DO $$
DECLARE
  album RECORD;
  trimmed TEXT;
  normalized TEXT;
BEGIN
  FOR album IN SELECT "id", "release_date" FROM "albums" WHERE "release_date" IS NOT NULL LOOP
    trimmed := btrim(album.release_date);
    BEGIN
      IF trimmed ~ '^\d{4}-\d{2}-\d{2}' THEN
        normalized := to_char(substring(trimmed FROM 1 FOR 10)::date, 'YYYY-MM-DD');
      ELSIF trimmed ~ '^\d{4}(-\d{2})?$' OR trimmed = '' THEN
        normalized := NULL;
      ELSE
        normalized := to_char(trimmed::timestamptz AT TIME ZONE 'UTC', 'YYYY-MM-DD');
      END IF;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      IF trimmed ~ '^\d{4}-\d{2}-\d{2}' THEN
        normalized := NULL;
      ELSE
        CONTINUE;
      END IF;
    END;
    IF normalized IS DISTINCT FROM album.release_date THEN
      UPDATE "albums" SET "release_date" = normalized WHERE "id" = album.id;
    END IF;
  END LOOP;
END $$;
