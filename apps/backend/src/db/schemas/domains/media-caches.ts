import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { bytea } from "./column-types.js";

// Permanent cache for artist images (Spotify-backed). Used by genre-search
// and artist-info to avoid redundant Spotify lookups. Rows never expire,
// because images are small URLs that don't change often enough to warrant expiry.
/**
 * Permanent cache of artist image URLs keyed by normalized artist name.
 * Used by genre search and artist-info flows to avoid repeated upstream image
 * lookups.
 */
export const artistImages = pgTable("artist_images", {
  nameKey: text("name_key").primaryKey(),
  displayName: text("display_name").notNull(),
  imageUrl: text("image_url").notNull(),
  source: text("source").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
});

// Permanent cache for track artwork URLs (typically album covers).
// Key: normalized "artist|title" composite. Populated by Last.fm
// track.getInfo during genre-search, reused on repeat queries.
/**
 * Permanent cache of track artwork URLs keyed by normalized artist/title.
 * Populated by Last.fm genre-search lookups and reused across repeat queries.
 */
export const trackImages = pgTable("track_images", {
  lookupKey: text("lookup_key").primaryKey(),
  artistName: text("artist_name").notNull(),
  trackTitle: text("track_title").notNull(),
  imageUrl: text("image_url").notNull(),
  source: text("source").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
});

// Permanent cache for album artwork URLs. Key: normalized "artist|title"
// composite. Populated directly from Last.fm tag.getTopAlbums responses.
/**
 * Permanent cache of album artwork URLs keyed by normalized artist/title.
 * Populated from Last.fm tag album responses for genre artwork enrichment.
 */
export const albumImages = pgTable("album_images", {
  lookupKey: text("lookup_key").primaryKey(),
  artistName: text("artist_name").notNull(),
  albumTitle: text("album_title").notNull(),
  imageUrl: text("image_url").notNull(),
  source: text("source").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
});

// Per-plugin runtime state (enabled flag). Sparse: missing row = use
// manifest.defaultEnabled. See services/plugins/registry.ts.
/**
 * Runtime enablement overrides for resolver plugins.
 * Missing rows intentionally fall back to the plugin manifest's default state.
 */
export const servicePlugins = pgTable("service_plugins", {
  id: text("id").primaryKey(),
  enabled: boolean("enabled").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

// Procedurally generated genre artworks. The grid endpoint serves one
// unique JPEG per genre, with a dominant accent color derived from the
// average color of the genre's top Last.fm album cover. First request
// generates and stores; subsequent requests hit this cache.
/**
 * Procedurally generated JPEG artwork cache for genre grid tiles.
 * Stores binary artwork, accent color and source-cover provenance per genre.
 */
export const genreArtworks = pgTable("genre_artworks", {
  genreKey: text("genre_key").primaryKey(),
  jpeg: bytea("jpeg").notNull(),
  accentColor: text("accent_color").notNull(),
  sourceCoverUrl: text("source_cover_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});
