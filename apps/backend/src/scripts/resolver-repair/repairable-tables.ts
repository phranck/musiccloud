/**
 * The tables a repair may touch. A planner that needs another table adds it here in the same change, so the list a
 * reviewer reads is the list the runner enforces.
 */
export const REPAIRABLE_TABLES: ReadonlySet<string> = new Set([
  "tracks",
  "albums",
  "artist_profiles",
  "service_links",
  "service_link_misses",
  "short_urls",
  "track_external_ids",
  "track_artist_credits",
  "track_previews",
  "album_service_links",
  "album_short_urls",
  "album_external_ids",
  "album_artist_credits",
  "album_previews",
  "track_short_url_aliases",
  "album_short_url_aliases",
  "artist_entities",
  "artist_entity_names",
]);
