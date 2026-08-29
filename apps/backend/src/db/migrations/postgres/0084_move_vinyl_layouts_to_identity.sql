-- Moves the Discogs layout cache off album rows and onto the artist-qualified
-- identity it actually belongs to.
--
-- Every existing layout is reachable through album_vinyl_layout_identities,
-- which is what supplies the key here. Where two albums somehow share one
-- identity, the more recently fetched layout wins, so the result does not
-- depend on the order rows are read in.
--
-- The old tables and the placeholder albums they forced into existence are
-- removed in a later migration, once the code reads from here.

INSERT INTO vinyl_layouts (identity_key, discogs_release_id, layout_data, fetched_at)
SELECT i.identity_key, l.discogs_release_id, l.layout_data, l.fetched_at
FROM album_vinyl_layouts l
JOIN album_vinyl_layout_identities i ON i.album_id = l.album_id
ON CONFLICT (identity_key) DO UPDATE SET
  discogs_release_id = EXCLUDED.discogs_release_id,
  layout_data = EXCLUDED.layout_data,
  fetched_at = EXCLUDED.fetched_at
WHERE EXCLUDED.fetched_at > vinyl_layouts.fetched_at;
