-- Removes the albums that only ever existed to give the layout cache a row to
-- hang off. The cache now keys on the identity, so nothing points at them.
--
-- The predicate is deliberately narrow: an album qualifies only when it is a
-- layout cache owner, carries none of its own catalogue fields, and nothing
-- else references it. A real album that happened to become the cache owner
-- therefore stays, which is why this deletes fewer rows than there are owners.
--
-- The one exception to "nothing references it" is a Discogs release external
-- id, which enrichment attached to whichever row owned the cache. That value
-- also lives in vinyl_layouts.discogs_release_id, so removing it loses
-- nothing. Any other external id disqualifies the row.
--
-- The foreign keys from album_external_ids and album_vinyl_layout_identities
-- cascade, so those rows go with their album.

DELETE FROM albums a
WHERE EXISTS (SELECT 1 FROM album_vinyl_layout_identities i WHERE i.album_id = a.id)
  AND a.source_service IS NULL
  AND a.total_tracks IS NULL
  AND a.artwork_url IS NULL
  AND a.release_date IS NULL
  AND a.upc IS NULL
  AND NOT EXISTS (SELECT 1 FROM album_artist_credits c WHERE c.album_id = a.id)
  AND NOT EXISTS (SELECT 1 FROM album_service_links l WHERE l.album_id = a.id)
  AND NOT EXISTS (SELECT 1 FROM album_short_urls s WHERE s.album_id = a.id)
  AND NOT EXISTS (SELECT 1 FROM album_previews p WHERE p.album_id = a.id)
  AND NOT EXISTS (
    SELECT 1 FROM album_external_ids e
    WHERE e.album_id = a.id AND e.id_type <> 'discogs_release'
  );
