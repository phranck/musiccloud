import { index, pgTable, real, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { artistEntities } from "./artist-identity.js";

// ─── Artist Profile / Share Tables ──────────────────────────────────────────

/**
 * Share-page profile records for normalized artists.
 * Stores image, genres and source URL metadata for artist resolver results;
 * identity facts stay in the normalized artist tables.
 */
export const artistProfiles = pgTable(
  "artist_profiles",
  {
    artistEntityId: text("artist_entity_id")
      .primaryKey()
      .notNull()
      .references(() => artistEntities.id, { onDelete: "cascade" }),
    imageUrl: text("image_url"),
    genres: text("genres"), // JSON array
    sourceService: text("source_service"),
    sourceUrl: text("source_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_artist_profiles_source_url").on(table.sourceUrl),
    // Mirror of idx_tracks_created_at: ArtistsPage default sort.
    index("idx_artist_profiles_created_at").on(table.createdAt.desc()),
    index("idx_artist_profiles_updated_at").on(table.updatedAt.desc()),
  ],
);

/**
 * Per-artist outbound links to streaming and catalogue services.
 * One row per `(artist entity, service)` with confidence and matching method.
 */
export const artistServiceLinks = pgTable(
  "artist_service_links",
  {
    id: text("id").primaryKey(),
    artistEntityId: text("artist_entity_id")
      .notNull()
      .references(() => artistEntities.id, { onDelete: "cascade" }),
    service: text("service").notNull(),
    externalId: text("external_id"),
    url: text("url").notNull(),
    confidence: real("confidence").notNull(),
    matchMethod: text("match_method").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_artist_service_links_entity_service").on(table.artistEntityId, table.service),
    index("idx_artist_service_links_service_external").on(table.service, table.externalId),
  ],
);

// Artist-level counterpart to `track_external_ids` / `album_external_ids`.
// Aggregates MBID/Discogs/ISNI values observed across services.
/**
 * Multi-source external identifiers observed for artists.
 * Aggregates MBID, Discogs, ISNI and future artist-level identifiers per
 * normalized artist entity.
 */
export const artistExternalIds = pgTable(
  "artist_external_ids",
  {
    id: text("id").primaryKey(),
    artistEntityId: text("artist_entity_id")
      .notNull()
      .references(() => artistEntities.id, { onDelete: "cascade" }),
    idType: text("id_type").notNull(),
    idValue: text("id_value").notNull(),
    sourceService: text("source_service").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_artist_external_ids_unique").on(
      table.artistEntityId,
      table.idType,
      table.idValue,
      table.sourceService,
    ),
    index("idx_artist_external_ids_lookup").on(table.idType, table.idValue),
    index("idx_artist_external_ids_entity").on(table.artistEntityId),
  ],
);

/**
 * Public short-code mapping for artist share pages.
 * The unique `artist_entity_id` index enforces one canonical share URL per
 * normalized artist entity.
 */
export const artistShortUrls = pgTable(
  "artist_short_urls",
  {
    id: text("id").primaryKey(),
    artistEntityId: text("artist_entity_id")
      .notNull()
      .references(() => artistEntities.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  // Same rationale as idx_short_urls_track_id: LEFT JOIN in listArtists.
  (table) => [
    index("idx_artist_short_urls_entity_id").on(table.artistEntityId),
    uniqueIndex("uq_artist_short_urls_entity_id").on(table.artistEntityId),
  ],
);
