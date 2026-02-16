import { pgTable, text, integer, real, bigint, uniqueIndex, index } from "drizzle-orm/pg-core";

export const tracks = pgTable("tracks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  artists: text("artists").notNull(),
  albumName: text("album_name"),
  isrc: text("isrc"),
  artworkUrl: text("artwork_url"),
  durationMs: integer("duration_ms"),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_tracks_isrc").on(table.isrc),
]);

export const serviceLinks = pgTable("service_links", {
  id: text("id").primaryKey(),
  trackId: text("track_id").notNull().references(() => tracks.id),
  service: text("service").notNull(),
  externalId: text("external_id"),
  url: text("url").notNull(),
  confidence: real("confidence").notNull(),
  matchMethod: text("match_method").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
}, (table) => [
  uniqueIndex("idx_service_links_track_service").on(table.trackId, table.service),
  index("idx_service_links_service_external").on(table.service, table.externalId),
]);

export const shortUrls = pgTable("short_urls", {
  id: text("id").primaryKey(),
  trackId: text("track_id").notNull().references(() => tracks.id),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
