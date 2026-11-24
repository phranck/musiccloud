import { sql } from "drizzle-orm";
import { index, integer, pgTable, real, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Canonical track records resolved from streaming-service inputs.
 * Stores source metadata, stable lookup identifiers and admin sort timestamps;
 * service fan-out lives in `serviceLinks` and artist credits live in
 * `trackArtistCredits`.
 */
export const tracks = pgTable(
  "tracks",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    albumName: text("album_name"),
    isrc: text("isrc"),
    artworkUrl: text("artwork_url"),
    durationMs: integer("duration_ms"),
    releaseDate: text("release_date"),
    isExplicit: integer("is_explicit"),
    sourceService: text("source_service"),
    sourceUrl: text("source_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("idx_tracks_isrc").on(table.isrc),
    index("idx_tracks_source_url").on(table.sourceUrl).where(sql`${table.sourceUrl} IS NOT NULL`),
    // Dashboard TracksPage default sort is `created_at DESC`; without this
    // index every page load does a top-N heapsort on the whole table.
    index("idx_tracks_created_at").on(table.createdAt.desc()),
    index("idx_tracks_updated_at").on(table.updatedAt.desc()),
    index("idx_tracks_title").on(table.title),
    index("idx_tracks_title_trgm").using("gin", table.title.op("gin_trgm_ops")),
  ],
);

/**
 * Per-track outbound links to streaming services.
 * One row per `(track, service)` with confidence and match provenance used
 * by share pages, cache hits and admin inspection.
 */
export const serviceLinks = pgTable(
  "service_links",
  {
    id: text("id").primaryKey(),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id),
    service: text("service").notNull(),
    externalId: text("external_id"),
    url: text("url").notNull(),
    confidence: real("confidence").notNull(),
    matchMethod: text("match_method").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_service_links_track_service").on(table.trackId, table.service),
    index("idx_service_links_service_external").on(table.service, table.externalId),
  ],
);

/**
 * Records that a service was asked about a track and had nothing.
 *
 * `service_links` above says where a track was found. Without its
 * counterpart, a service that does not carry the track is indistinguishable
 * from one that was never asked, so every later resolve of that track asks
 * again, and keeps asking for as long as the row exists. This table is what
 * makes a fruitless lookup cost something once instead of every time.
 *
 * The row expires rather than being permanent: a catalogue does gain tracks,
 * so a miss is only good for `SERVICE_MISS_TTL_MS`, after which the service is
 * asked once more.
 */
export const serviceLinkMisses = pgTable(
  "service_link_misses",
  {
    id: text("id").primaryKey(),
    // A miss means nothing without its track, so it goes with the track. Every
    // path that deletes tracks relies on this rather than deleting misses first.
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    service: text("service").notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex("idx_service_link_misses_track_service").on(table.trackId, table.service)],
);

// Multi-source external identifier aggregation for tracks. The canonical
// `tracks.isrc` column stores the primary value used for fast lookups; this
// table additionally records every (id_type, id_value, source_service)
// triple observed during cross-service resolves. Allows a single track to
// carry many ISRCs (regional variants, re-releases) plus future ID classes
// (MBID, ISWC, AcoustID) without further migrations.
/**
 * Multi-source external identifiers observed for tracks.
 * Extends the canonical `tracks.isrc` lookup with every `(id_type, id_value,
 * source_service)` tuple harvested during cross-service resolution.
 */
export const trackExternalIds = pgTable(
  "track_external_ids",
  {
    id: text("id").primaryKey(),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    idType: text("id_type").notNull(),
    idValue: text("id_value").notNull(),
    sourceService: text("source_service").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_track_external_ids_unique").on(table.trackId, table.idType, table.idValue, table.sourceService),
    index("idx_track_external_ids_lookup").on(table.idType, table.idValue),
    index("idx_track_external_ids_track").on(table.trackId),
  ],
);

// Per-(track, service) preview URL with explicit expiry. Hosts the only
// genuinely time-sensitive field that used to live on `tracks.preview_url`,
// the field that forced the legacy 48 h CACHE_TTL gate on the entire row.
// Pulling it out of `tracks` lets the canonical track row stay
// permanently fresh and have the preview refreshed lazily on demand.
//
// `expires_at` is `null` when the URL has no parseable expiry (most
// services serve permanent CDN URLs). Deezer signs preview URLs with
// `hdnea=exp=<unix>` and gets a real expiry stamped at write time.
//
// UNIQUE(track_id, service) + ON CONFLICT REPLACE keeps one row per
// emitter; refreshing a Deezer preview overwrites the URL in place
// rather than appending a new row.
/**
 * Per-track preview audio URLs with optional expiry metadata.
 * Keeps volatile CDN preview links separate from permanent track cache rows.
 */
export const trackPreviews = pgTable(
  "track_previews",
  {
    id: text("id").primaryKey(),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    service: text("service").notNull(),
    url: text("url").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_track_previews_track_service").on(table.trackId, table.service),
    index("idx_track_previews_track").on(table.trackId),
  ],
);

/**
 * Public short-code mapping for track share pages.
 * The unique `track_id` index enforces one canonical share URL per track.
 */
export const shortUrls = pgTable(
  "short_urls",
  {
    id: text("id").primaryKey(),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  // LEFT JOIN target in listTracks. Without this index the join degrades to
  // a sequential scan of every short_urls row on every list-page request.
  (table) => [
    index("idx_short_urls_track_id").on(table.trackId),
    uniqueIndex("uq_short_urls_track_id").on(table.trackId),
  ],
);

/**
 * Further short ids that address a track, next to the one in `short_urls`.
 *
 * `short_urls` holds exactly one id per track, and many queries join it on the track, so a second id there would
 * return the track twice. When duplicate records of one recording are merged, the short id of the record that goes
 * is kept here instead. A lookup by short id falls back to this table and answers with the canonical track.
 */
export const trackShortUrlAliases = pgTable(
  "track_short_url_aliases",
  {
    id: text("id").primaryKey(),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("idx_track_short_url_aliases_track_id").on(table.trackId)],
);
