import { mysqlTable, varchar, text, int, float, bigint, uniqueIndex, index } from "drizzle-orm/mysql-core";

export const tracks = mysqlTable("tracks", {
  id: varchar("id", { length: 36 }).primaryKey(),
  title: text("title").notNull(),
  artists: text("artists").notNull(),
  albumName: text("album_name"),
  isrc: varchar("isrc", { length: 15 }),
  artworkUrl: text("artwork_url"),
  durationMs: int("duration_ms"),
  releaseDate: varchar("release_date", { length: 10 }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
}, (table) => [
  index("idx_tracks_isrc").on(table.isrc),
]);

export const serviceLinks = mysqlTable("service_links", {
  id: varchar("id", { length: 36 }).primaryKey(),
  trackId: varchar("track_id", { length: 36 }).notNull().references(() => tracks.id, { onDelete: "cascade" }),
  service: varchar("service", { length: 50 }).notNull(),
  externalId: varchar("external_id", { length: 255 }),
  url: text("url").notNull(),
  confidence: float("confidence").notNull(),
  matchMethod: varchar("match_method", { length: 50 }).notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
}, (table) => [
  uniqueIndex("idx_service_links_track_service").on(table.trackId, table.service),
  index("idx_service_links_service_external").on(table.service, table.externalId),
]);

export const shortUrls = mysqlTable("short_urls", {
  id: varchar("id", { length: 12 }).primaryKey(),
  trackId: varchar("track_id", { length: 36 }).notNull().references(() => tracks.id, { onDelete: "cascade" }),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
});
