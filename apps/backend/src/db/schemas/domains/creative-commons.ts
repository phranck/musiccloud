import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

// ============================================================================
// CREATIVE COMMONS (Jamendo). These entity families share nothing with the commercial catalog.
// ============================================================================

/**
 * Creative-Commons artists resolved from Jamendo.
 * Slim by design: a single localized bio blob, no normalized identity graph.
 */
export const ccArtists = pgTable(
  "cc_artists",
  {
    id: text("id").primaryKey(),
    jamendoId: text("jamendo_id").notNull(),
    name: text("name").notNull(),
    imageUrl: text("image_url"),
    website: text("website"),
    bio: jsonb("bio"), // localized { en, de, ... }
    shareUrl: text("share_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex("uq_cc_artists_jamendo_id").on(table.jamendoId), index("idx_cc_artists_name").on(table.name)],
);

/**
 * Creative-Commons albums resolved from Jamendo.
 */
export const ccAlbums = pgTable(
  "cc_albums",
  {
    id: text("id").primaryKey(),
    jamendoId: text("jamendo_id").notNull(),
    name: text("name").notNull(),
    ccArtistId: text("cc_artist_id").references(() => ccArtists.id),
    artworkUrl: text("artwork_url"),
    releaseDate: text("release_date"),
    zipUrl: text("zip_url"),
    shareUrl: text("share_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("uq_cc_albums_jamendo_id").on(table.jamendoId),
    index("idx_cc_albums_cc_artist_id").on(table.ccArtistId),
  ],
);

/**
 * Creative-Commons tracks resolved from Jamendo.
 * `stream_url` is the permanent full-track stream (no expiry, unlike commercial
 * previews). `download_allowed` mirrors Jamendo's `audiodownload_allowed`.
 */
export const ccTracks = pgTable(
  "cc_tracks",
  {
    id: text("id").primaryKey(),
    jamendoId: text("jamendo_id").notNull(),
    title: text("title").notNull(),
    artistName: text("artist_name").notNull(),
    ccArtistId: text("cc_artist_id").references(() => ccArtists.id),
    albumName: text("album_name"),
    ccAlbumId: text("cc_album_id").references(() => ccAlbums.id),
    artworkUrl: text("artwork_url"),
    durationMs: integer("duration_ms"),
    releaseDate: text("release_date"),
    licenseCcurl: text("license_ccurl"),
    streamUrl: text("stream_url").notNull(),
    downloadUrl: text("download_url"),
    downloadAllowed: integer("download_allowed"),
    waveform: text("waveform"),
    shareUrl: text("share_url"),
    // 1-based position within an album's tracklist; set when this track is
    // persisted as part of an album resolve, NULL for standalone single resolves.
    albumPosition: integer("album_position"),
    // 0-based rank within its artist's popularity-ordered top-tracks; set when
    // persisted as part of an artist resolve, NULL otherwise.
    artistTopPosition: integer("artist_top_position"),
    // `include=musicinfo` classification + `include=stats` counters, captured at
    // single-track resolve so the share page renders the details card from the DB.
    musicInfo: jsonb("music_info"),
    stats: jsonb("stats"),
    // Jamendo Pro licensing flag (0/1) + page URL (`include=licenses`).
    proLicensing: integer("pro_licensing"),
    proUrl: text("pro_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("uq_cc_tracks_jamendo_id").on(table.jamendoId),
    index("idx_cc_tracks_cc_artist_id").on(table.ccArtistId),
    index("idx_cc_tracks_cc_album_id").on(table.ccAlbumId),
    index("idx_cc_tracks_title").on(table.title),
    index("idx_cc_tracks_created_at").on(table.createdAt.desc()),
  ],
);

/**
 * Public short-code mapping for CC track share pages.
 * Mirrors the commercial `short_urls` pattern (`id` is the code, one per track),
 * but is created eagerly on track persistence so every CC track is immediately
 * shareable and playlist-ready.
 */
export const ccShortUrls = pgTable(
  "cc_short_urls",
  {
    id: text("id").primaryKey(),
    ccTrackId: text("cc_track_id")
      .notNull()
      .references(() => ccTracks.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("idx_cc_short_urls_cc_track_id").on(table.ccTrackId),
    uniqueIndex("uq_cc_short_urls_cc_track_id").on(table.ccTrackId),
  ],
);

/**
 * Public short-code mapping for CC album share pages.
 * Mirrors {@link ccShortUrls} (one stable code per entity, eager mint), but keyed
 * to a CC album so a resolved CC album is immediately shareable.
 */
export const ccAlbumShortUrls = pgTable(
  "cc_album_short_urls",
  {
    id: text("id").primaryKey(),
    ccAlbumId: text("cc_album_id")
      .notNull()
      .references(() => ccAlbums.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("idx_cc_album_short_urls_cc_album_id").on(table.ccAlbumId),
    uniqueIndex("uq_cc_album_short_urls_cc_album_id").on(table.ccAlbumId),
  ],
);

/**
 * Public short-code mapping for CC artist share pages.
 * Mirrors {@link ccShortUrls} (one stable code per entity, eager mint), but keyed
 * to a CC artist so a resolved CC artist is immediately shareable.
 */
export const ccArtistShortUrls = pgTable(
  "cc_artist_short_urls",
  {
    id: text("id").primaryKey(),
    ccArtistId: text("cc_artist_id")
      .notNull()
      .references(() => ccArtists.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("idx_cc_artist_short_urls_cc_artist_id").on(table.ccArtistId),
    uniqueIndex("uq_cc_artist_short_urls_cc_artist_id").on(table.ccArtistId),
  ],
);
