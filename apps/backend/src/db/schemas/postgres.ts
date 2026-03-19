import {
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const tracks = pgTable(
  "tracks",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    artists: text("artists").notNull(), // JSON array
    albumName: text("album_name"),
    isrc: text("isrc"),
    artworkUrl: text("artwork_url"),
    durationMs: integer("duration_ms"),
    releaseDate: text("release_date"),
    isExplicit: integer("is_explicit"),
    previewUrl: text("preview_url"),
    sourceService: text("source_service"),
    sourceUrl: text("source_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("idx_tracks_isrc").on(table.isrc)]
);

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
  ]
);

export const shortUrls = pgTable("short_urls", {
  id: text("id").primaryKey(),
  trackId: text("track_id")
    .notNull()
    .references(() => tracks.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const albums = pgTable(
  "albums",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    artists: text("artists").notNull(), // JSON array
    releaseDate: text("release_date"),
    totalTracks: integer("total_tracks"),
    artworkUrl: text("artwork_url"),
    label: text("label"),
    upc: text("upc"),
    sourceService: text("source_service"),
    sourceUrl: text("source_url"),
    previewUrl: text("preview_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("idx_albums_upc").on(table.upc)]
);

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
  ]
);

export const albumShortUrls = pgTable("album_short_urls", {
  id: text("id").primaryKey(),
  albumId: text("album_id")
    .notNull()
    .references(() => albums.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const adminUsers = pgTable("admin_users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  email: text("email"),
  role: text("role").notNull().default("admin"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  avatarUrl: text("avatar_url"),
  locale: text("locale").notNull().default("de"),
  inviteTokenHash: text("invite_token_hash"),
  inviteExpiresAt: timestamp("invite_expires_at", { withTimezone: true }),
  sessionTimeoutMinutes: integer("session_timeout_minutes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
});

// Artist cache for caching artist info from external services
export const artistCache = pgTable("artist_cache", {
  id: text("id").primaryKey(),
  artistName: text("artist_name").notNull(),
  profile: text("profile"), // JSON
  topTracks: text("top_tracks"), // JSON
  events: text("events"), // JSON
  profileUpdatedAt: timestamp("profile_updated_at", { withTimezone: true }),
  tracksUpdatedAt: timestamp("tracks_updated_at", { withTimezone: true }),
  eventsUpdatedAt: timestamp("events_updated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

// URL aliases for backward compatibility / tracking
export const urlAliases = pgTable("url_aliases", {
  id: text("id").primaryKey(),
  shortId: text("short_id").notNull().unique(),
  trackId: text("track_id").references(() => tracks.id),
  albumId: text("album_id").references(() => albums.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

// Featured tracks / albums
export const featuredTracks = pgTable("featured_tracks", {
  id: text("id").primaryKey(),
  trackId: text("track_id").notNull().unique().references(() => tracks.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const featuredAlbums = pgTable("featured_albums", {
  id: text("id").primaryKey(),
  albumId: text("album_id").notNull().unique().references(() => albums.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});
