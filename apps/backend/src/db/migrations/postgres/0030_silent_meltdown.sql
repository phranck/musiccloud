ALTER TABLE "artists" DROP CONSTRAINT "artists_artist_entity_id_artist_entities_id_fk";
--> statement-breakpoint
CREATE OR REPLACE FUNCTION _musiccloud_artist_names_from_json(input_text text)
RETURNS TABLE(artist_name text, artist_ordinality bigint)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
    SELECT parsed.value, parsed.ordinality
    FROM jsonb_array_elements_text(input_text::jsonb) WITH ORDINALITY AS parsed(value, ordinality);
EXCEPTION WHEN others THEN
  RETURN;
END;
$$;
--> statement-breakpoint
WITH raw_names AS (
  SELECT parsed.artist_name AS name
  FROM tracks
  CROSS JOIN LATERAL _musiccloud_artist_names_from_json(tracks.artists) AS parsed
  WHERE parsed.artist_name IS NOT NULL
  UNION ALL
  SELECT parsed.artist_name AS name
  FROM albums
  CROSS JOIN LATERAL _musiccloud_artist_names_from_json(albums.artists) AS parsed
  WHERE parsed.artist_name IS NOT NULL
  UNION ALL
  SELECT artists.name
  FROM artists
),
canonical_names AS (
  SELECT DISTINCT ON (LOWER(BTRIM(name)))
    name,
    LOWER(BTRIM(name)) AS name_key
  FROM raw_names
  WHERE name IS NOT NULL
  ORDER BY LOWER(BTRIM(name)), name ASC
),
new_entity_names AS (
  SELECT
    'legacy-artist-entity-' || md5(name_key) AS artist_entity_id,
    name,
    name_key
  FROM canonical_names canonical
  WHERE NOT EXISTS (
    SELECT 1
    FROM artist_entity_names existing
    WHERE LOWER(BTRIM(existing.name)) = canonical.name_key
  )
)
INSERT INTO artist_entities (id, entity_type, verification_status, confidence, created_at, updated_at)
SELECT artist_entity_id, 'unknown', 'candidate', NULL, NOW(), NOW()
FROM new_entity_names
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
WITH raw_names AS (
  SELECT parsed.artist_name AS name
  FROM tracks
  CROSS JOIN LATERAL _musiccloud_artist_names_from_json(tracks.artists) AS parsed
  WHERE parsed.artist_name IS NOT NULL
  UNION ALL
  SELECT parsed.artist_name AS name
  FROM albums
  CROSS JOIN LATERAL _musiccloud_artist_names_from_json(albums.artists) AS parsed
  WHERE parsed.artist_name IS NOT NULL
  UNION ALL
  SELECT artists.name
  FROM artists
),
canonical_names AS (
  SELECT DISTINCT ON (LOWER(BTRIM(name)))
    name,
    LOWER(BTRIM(name)) AS name_key
  FROM raw_names
  WHERE name IS NOT NULL
  ORDER BY LOWER(BTRIM(name)), name ASC
),
mapped_names AS (
  SELECT
    COALESCE(
      (
        SELECT existing.artist_entity_id
        FROM artist_entity_names existing
        WHERE LOWER(BTRIM(existing.name)) = canonical.name_key
        ORDER BY
          CASE
            WHEN existing.name_type = 'canonical' AND existing.locale IS NULL THEN 0
            WHEN existing.name_type = 'canonical' THEN 1
            WHEN existing.name_type = 'credit' THEN 2
            WHEN existing.locale IS NULL THEN 3
            ELSE 4
          END,
          existing.created_at ASC
        LIMIT 1
      ),
      'legacy-artist-entity-' || md5(canonical.name_key)
    ) AS artist_entity_id,
    canonical.name,
    canonical.name_key
  FROM canonical_names canonical
)
INSERT INTO artist_entity_names (id, artist_entity_id, locale, name, name_type, source_id, created_at)
SELECT
  'legacy-artist-name-' || md5(artist_entity_id || ':' || name_key),
  artist_entity_id,
  NULL,
  name,
  'canonical',
  NULL,
  NOW()
FROM mapped_names mapped
WHERE NOT EXISTS (
  SELECT 1
  FROM artist_entity_names existing
  WHERE existing.artist_entity_id = mapped.artist_entity_id
    AND LOWER(BTRIM(existing.name)) = mapped.name_key
    AND existing.name_type = 'canonical'
)
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
WITH mapped_artists AS (
  SELECT
    artists.id AS artist_id,
    COALESCE(
      artists.artist_entity_id,
      (
        SELECT existing.artist_entity_id
        FROM artist_entity_names existing
        WHERE LOWER(BTRIM(existing.name)) = LOWER(BTRIM(artists.name))
        ORDER BY
          CASE
            WHEN existing.name_type = 'canonical' AND existing.locale IS NULL THEN 0
            WHEN existing.name_type = 'canonical' THEN 1
            WHEN existing.name_type = 'credit' THEN 2
            WHEN existing.locale IS NULL THEN 3
            ELSE 4
          END,
          existing.created_at ASC
        LIMIT 1
      ),
      'legacy-artist-entity-' || md5(LOWER(BTRIM(artists.name)))
    ) AS artist_entity_id
  FROM artists
)
UPDATE artists
SET artist_entity_id = mapped_artists.artist_entity_id
FROM mapped_artists
WHERE artists.id = mapped_artists.artist_id
  AND artists.artist_entity_id IS NULL;
--> statement-breakpoint
WITH expanded AS (
  SELECT
    tracks.id AS track_id,
    parsed.artist_name AS credit_name,
    (parsed.artist_ordinality - 1)::integer AS credit_position,
    LOWER(BTRIM(parsed.artist_name)) AS name_key
  FROM tracks
  CROSS JOIN LATERAL _musiccloud_artist_names_from_json(tracks.artists) AS parsed
  WHERE parsed.artist_name IS NOT NULL
),
mapped AS (
  SELECT
    expanded.track_id,
    expanded.credit_name,
    expanded.credit_position,
    COALESCE(
      (
        SELECT existing.artist_entity_id
        FROM artist_entity_names existing
        WHERE LOWER(BTRIM(existing.name)) = expanded.name_key
        ORDER BY
          CASE
            WHEN existing.name_type = 'canonical' AND existing.locale IS NULL THEN 0
            WHEN existing.name_type = 'canonical' THEN 1
            WHEN existing.name_type = 'credit' THEN 2
            WHEN existing.locale IS NULL THEN 3
            ELSE 4
          END,
          existing.created_at ASC
        LIMIT 1
      ),
      'legacy-artist-entity-' || md5(expanded.name_key)
    ) AS artist_entity_id
  FROM expanded
)
INSERT INTO track_artist_credits (
  id, track_id, artist_entity_id, credit_name, credit_position, credit_role,
  confidence, match_method, source_id, created_at
)
SELECT
  'legacy-track-credit-' || md5(track_id || ':' || credit_position || ':' || artist_entity_id || ':' || credit_name),
  track_id,
  artist_entity_id,
  credit_name,
  credit_position,
  'main',
  NULL,
  'legacy_json_artists',
  NULL,
  NOW()
FROM mapped
ON CONFLICT DO NOTHING;
--> statement-breakpoint
WITH expanded AS (
  SELECT
    albums.id AS album_id,
    parsed.artist_name AS credit_name,
    (parsed.artist_ordinality - 1)::integer AS credit_position,
    LOWER(BTRIM(parsed.artist_name)) AS name_key
  FROM albums
  CROSS JOIN LATERAL _musiccloud_artist_names_from_json(albums.artists) AS parsed
  WHERE parsed.artist_name IS NOT NULL
),
mapped AS (
  SELECT
    expanded.album_id,
    expanded.credit_name,
    expanded.credit_position,
    COALESCE(
      (
        SELECT existing.artist_entity_id
        FROM artist_entity_names existing
        WHERE LOWER(BTRIM(existing.name)) = expanded.name_key
        ORDER BY
          CASE
            WHEN existing.name_type = 'canonical' AND existing.locale IS NULL THEN 0
            WHEN existing.name_type = 'canonical' THEN 1
            WHEN existing.name_type = 'credit' THEN 2
            WHEN existing.locale IS NULL THEN 3
            ELSE 4
          END,
          existing.created_at ASC
        LIMIT 1
      ),
      'legacy-artist-entity-' || md5(expanded.name_key)
    ) AS artist_entity_id
  FROM expanded
)
INSERT INTO album_artist_credits (
  id, album_id, artist_entity_id, credit_name, credit_position, credit_role,
  confidence, match_method, source_id, created_at
)
SELECT
  'legacy-album-credit-' || md5(album_id || ':' || credit_position || ':' || artist_entity_id || ':' || credit_name),
  album_id,
  artist_entity_id,
  credit_name,
  credit_position,
  'main',
  NULL,
  'legacy_json_artists',
  NULL,
  NOW()
FROM mapped
ON CONFLICT DO NOTHING;
--> statement-breakpoint
DROP INDEX "idx_artists_name";--> statement-breakpoint
ALTER TABLE "artists" ALTER COLUMN "artist_entity_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "artists" ADD CONSTRAINT "artists_artist_entity_id_artist_entities_id_fk" FOREIGN KEY ("artist_entity_id") REFERENCES "public"."artist_entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "albums" DROP COLUMN "artists";--> statement-breakpoint
ALTER TABLE "artists" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "tracks" DROP COLUMN "artists";--> statement-breakpoint
DROP FUNCTION _musiccloud_artist_names_from_json(text);
