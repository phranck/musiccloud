import { sql } from "drizzle-orm";
import { index, integer, pgTable, real, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Canonical album records resolved from streaming-service inputs.
 * Stores source metadata, album-level identifiers and admin sort timestamps;
 * links, previews, external ids and credits live in sibling tables.
 */
export const albums = pgTable(
  "albums",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    releaseDate: text("release_date"),
    totalTracks: integer("total_tracks"),
    artworkUrl: text("artwork_url"),
    label: text("label"),
    upc: text("upc"),
    sourceService: text("source_service"),
    sourceUrl: text("source_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("idx_albums_upc").on(table.upc),
    index("idx_albums_source_url").on(table.sourceUrl).where(sql`${table.sourceUrl} IS NOT NULL`),
    // Mirror of idx_tracks_created_at: AlbumsPage default sort.
    index("idx_albums_created_at").on(table.createdAt.desc()),
    index("idx_albums_updated_at").on(table.updatedAt.desc()),
    index("idx_albums_title").on(table.title),
    index("idx_albums_title_trgm").using("gin", table.title.op("gin_trgm_ops")),
  ],
);

/**
 * Per-album outbound links to streaming services.
 * Mirrors `serviceLinks` for album share pages and album cache lookups.
 */
export const albumServiceLinks = pgTable(
  "album_service_links",
  {
    id: text("id").primaryKey(),
    albumId: text("album_id")
      .notNull()
      .references(() => albums.id),
    service: text("service").notNull(),
    externalId: text("external_id"),
    url: text("url").notNull(),
    confidence: real("confidence").notNull(),
    matchMethod: text("match_method").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_album_service_links_album_service").on(table.albumId, table.service),
    index("idx_album_service_links_service_external").on(table.service, table.externalId),
  ],
);

// Album-level counterpart to `track_external_ids`. Aggregates UPC/EAN/MBID
// values observed across services for a given album.
/**
 * Multi-source external identifiers observed for albums.
 * Aggregates UPC, EAN, MBID and future album-level identifiers per source.
 */
export const albumExternalIds = pgTable(
  "album_external_ids",
  {
    id: text("id").primaryKey(),
    albumId: text("album_id")
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    idType: text("id_type").notNull(),
    idValue: text("id_value").notNull(),
    sourceService: text("source_service").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_album_external_ids_unique").on(table.albumId, table.idType, table.idValue, table.sourceService),
    index("idx_album_external_ids_lookup").on(table.idType, table.idValue),
    index("idx_album_external_ids_album").on(table.albumId),
  ],
);

// Album-level mirror of `track_previews`. See header on track_previews
// for design rationale.
/**
 * Per-album preview audio URLs with optional expiry metadata.
 * Mirrors `trackPreviews` for album share-page playback.
 */
export const albumPreviews = pgTable(
  "album_previews",
  {
    id: text("id").primaryKey(),
    albumId: text("album_id")
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    service: text("service").notNull(),
    url: text("url").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_album_previews_album_service").on(table.albumId, table.service),
    index("idx_album_previews_album").on(table.albumId),
  ],
);

/**
 * Public short-code mapping for album share pages.
 * The unique `album_id` index enforces one canonical share URL per album.
 */
export const albumShortUrls = pgTable(
  "album_short_urls",
  {
    id: text("id").primaryKey(),
    albumId: text("album_id")
      .notNull()
      .references(() => albums.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  // Same rationale as idx_short_urls_track_id: LEFT JOIN in listAlbums.
  (table) => [
    index("idx_album_short_urls_album_id").on(table.albumId),
    uniqueIndex("uq_album_short_urls_album_id").on(table.albumId),
  ],
);

/** Further short ids that address an album, for the same reason as `trackShortUrlAliases`. */
export const albumShortUrlAliases = pgTable(
  "album_short_url_aliases",
  {
    id: text("id").primaryKey(),
    albumId: text("album_id")
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("idx_album_short_url_aliases_album_id").on(table.albumId)],
);
