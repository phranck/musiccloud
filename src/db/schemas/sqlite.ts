import { sqliteTable, text, integer, real, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const tracks = sqliteTable("tracks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  artists: text("artists").notNull(),
  albumName: text("album_name"),
  isrc: text("isrc"),
  artworkUrl: text("artwork_url"),
  durationMs: integer("duration_ms"),
  releaseDate: text("release_date"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [
  index("idx_tracks_isrc").on(table.isrc),
]);

export const serviceLinks = sqliteTable("service_links", {
  id: text("id").primaryKey(),
  trackId: text("track_id").notNull().references(() => tracks.id),
  service: text("service").notNull(),
  externalId: text("external_id"),
  url: text("url").notNull(),
  confidence: real("confidence").notNull(),
  matchMethod: text("match_method").notNull(),
  createdAt: integer("created_at").notNull(),
}, (table) => [
  uniqueIndex("idx_service_links_track_service").on(table.trackId, table.service),
  index("idx_service_links_service_external").on(table.service, table.externalId),
]);

export const shortUrls = sqliteTable("short_urls", {
  id: text("id").primaryKey(),
  trackId: text("track_id").notNull().references(() => tracks.id),
  createdAt: integer("created_at").notNull(),
});
