import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, real, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { albums } from "./album-catalog.js";
import { artistEntities, artistSources } from "./artist-identity.js";
import { tracks } from "./track-catalog.js";

/**
 * Ordered artist credits for tracks.
 * Links track display credits to normalized artist entities while preserving
 * the credit name, role, position and match provenance seen on the source.
 */
export const trackArtistCredits = pgTable(
  "track_artist_credits",
  {
    id: text("id").primaryKey(),
    trackId: text("track_id")
      .notNull()
      .references(() => tracks.id, { onDelete: "cascade" }),
    artistEntityId: text("artist_entity_id")
      .notNull()
      .references(() => artistEntities.id, { onDelete: "cascade" }),
    creditName: text("credit_name").notNull(),
    creditPosition: integer("credit_position").notNull().default(0),
    creditRole: text("credit_role").notNull().default("main"),
    confidence: real("confidence"),
    matchMethod: text("match_method"),
    sourceId: text("source_id").references(() => artistSources.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_track_artist_credits_track").on(table.trackId, table.creditPosition),
    index("idx_track_artist_credits_entity").on(table.artistEntityId),
    index("idx_track_artist_credits_credit_name_trgm").using("gin", table.creditName.op("gin_trgm_ops")),
    uniqueIndex("idx_track_artist_credits_unique").on(
      table.trackId,
      table.creditPosition,
      table.creditRole,
      table.artistEntityId,
    ),
    check(
      "chk_track_artist_credits_role",
      sql`${table.creditRole} IN ('main', 'featured', 'remixer', 'producer', 'composer', 'lyricist', 'performer', 'unknown')`,
    ),
  ],
);

/**
 * Ordered artist credits for albums.
 * Album-side mirror of `trackArtistCredits` used by album share pages,
 * lookups and admin catalogue rows.
 */
export const albumArtistCredits = pgTable(
  "album_artist_credits",
  {
    id: text("id").primaryKey(),
    albumId: text("album_id")
      .notNull()
      .references(() => albums.id, { onDelete: "cascade" }),
    artistEntityId: text("artist_entity_id")
      .notNull()
      .references(() => artistEntities.id, { onDelete: "cascade" }),
    creditName: text("credit_name").notNull(),
    creditPosition: integer("credit_position").notNull().default(0),
    creditRole: text("credit_role").notNull().default("main"),
    confidence: real("confidence"),
    matchMethod: text("match_method"),
    sourceId: text("source_id").references(() => artistSources.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_album_artist_credits_album").on(table.albumId, table.creditPosition),
    index("idx_album_artist_credits_entity").on(table.artistEntityId),
    index("idx_album_artist_credits_credit_name_trgm").using("gin", table.creditName.op("gin_trgm_ops")),
    uniqueIndex("idx_album_artist_credits_unique").on(
      table.albumId,
      table.creditPosition,
      table.creditRole,
      table.artistEntityId,
    ),
    check(
      "chk_album_artist_credits_role",
      sql`${table.creditRole} IN ('main', 'featured', 'remixer', 'producer', 'composer', 'lyricist', 'performer', 'unknown')`,
    ),
  ],
);
