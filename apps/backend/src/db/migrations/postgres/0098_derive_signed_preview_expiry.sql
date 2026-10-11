-- Writes the expiry into stored preview rows that carry a signed Deezer URL
-- but no `expires_at`.
--
-- Deezer signs its preview URLs with an `hdnea=exp=<unix seconds>` token and
-- answers 403 once that moment has passed. To the resolver a null
-- `expires_at` means the URL never expires. Such a row therefore counts as
-- fresh, ranks above a row whose expiry is recorded, and stops the cached
-- resolve from asking Deezer for a new URL. The player then gets a URL that no
-- longer plays and shows the preview as unavailable. The share page reads the
-- token from the URL itself, which is why reloading it plays the preview.
--
-- The rows are the ones the 0021 backfill copied from the legacy columns with
-- a null expiry. The expiry is read the way `getDeezerPreviewExpiry` reads it:
-- a `dzcdn.net` host, and a positive `exp=` part in the `hdnea` parameter.
-- A row without that signature keeps its null, because its URL does not
-- expire. Idempotent, because an updated row stops matching.
UPDATE "track_previews" AS "preview"
SET "expires_at" = to_timestamp("signed"."expiry_seconds")
FROM (
  SELECT
    "id",
    substring("url" from '[?&]hdnea=(?:[^&#]*~)?exp=([1-9][0-9]*)(?:[~&#]|$)')::double precision AS "expiry_seconds"
  FROM "track_previews"
  WHERE "expires_at" IS NULL
    AND substring("url" from '^[A-Za-z][A-Za-z0-9+.-]*://([^/?#:]+)') ~* '(^|\.)dzcdn\.net$'
) AS "signed"
WHERE "preview"."id" = "signed"."id"
  AND "signed"."expiry_seconds" IS NOT NULL;
--> statement-breakpoint
UPDATE "album_previews" AS "preview"
SET "expires_at" = to_timestamp("signed"."expiry_seconds")
FROM (
  SELECT
    "id",
    substring("url" from '[?&]hdnea=(?:[^&#]*~)?exp=([1-9][0-9]*)(?:[~&#]|$)')::double precision AS "expiry_seconds"
  FROM "album_previews"
  WHERE "expires_at" IS NULL
    AND substring("url" from '^[A-Za-z][A-Za-z0-9+.-]*://([^/?#:]+)') ~* '(^|\.)dzcdn\.net$'
) AS "signed"
WHERE "preview"."id" = "signed"."id"
  AND "signed"."expiry_seconds" IS NOT NULL;
