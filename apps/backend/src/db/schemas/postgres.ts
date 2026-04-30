import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Postgres `bytea` column helper. Drizzle does not ship a first-party
 * bytea column type, so we declare one via `customType`. Values are read
 * and written as Node `Buffer` instances (the shape `pg` uses natively).
 */
const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType() {
    return "bytea";
  },
});

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
    sourceService: text("source_service"),
    sourceUrl: text("source_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("idx_tracks_isrc").on(table.isrc),
    // Dashboard TracksPage default sort is `created_at DESC`; without this
    // index every page load does a top-N heapsort on the whole table.
    index("idx_tracks_created_at").on(table.createdAt.desc()),
  ],
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
  ],
);

// Multi-source external identifier aggregation for tracks. The canonical
// `tracks.isrc` column stores the primary value used for fast lookups; this
// table additionally records every (id_type, id_value, source_service)
// triple observed during cross-service resolves. Allows a single track to
// carry many ISRCs (regional variants, re-releases) plus future ID classes
// (MBID, ISWC, AcoustID) without further migrations.
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
  (table) => [index("idx_short_urls_track_id").on(table.trackId)],
);

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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("idx_albums_upc").on(table.upc),
    // Mirror of idx_tracks_created_at: AlbumsPage default sort.
    index("idx_albums_created_at").on(table.createdAt.desc()),
  ],
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
  ],
);

// Album-level counterpart to `track_external_ids`. Aggregates UPC/EAN/MBID
// values observed across services for a given album.
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
  (table) => [index("idx_album_short_urls_album_id").on(table.albumId)],
);

// ─── Artist Resolution Tables ────────────────────────────────────────────────

export const artists = pgTable(
  "artists",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    imageUrl: text("image_url"),
    genres: text("genres"), // JSON array
    sourceService: text("source_service"),
    sourceUrl: text("source_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("idx_artists_name").on(table.name),
    // Mirror of idx_tracks_created_at: ArtistsPage default sort.
    index("idx_artists_created_at").on(table.createdAt.desc()),
  ],
);

export const artistServiceLinks = pgTable(
  "artist_service_links",
  {
    id: text("id").primaryKey(),
    artistId: text("artist_id")
      .notNull()
      .references(() => artists.id),
    service: text("service").notNull(),
    externalId: text("external_id"),
    url: text("url").notNull(),
    confidence: real("confidence").notNull(),
    matchMethod: text("match_method").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_artist_service_links_artist_service").on(table.artistId, table.service),
    index("idx_artist_service_links_service_external").on(table.service, table.externalId),
  ],
);

// Artist-level counterpart to `track_external_ids` / `album_external_ids`.
// Aggregates MBID/Discogs/ISNI values observed across services.
export const artistExternalIds = pgTable(
  "artist_external_ids",
  {
    id: text("id").primaryKey(),
    artistId: text("artist_id")
      .notNull()
      .references(() => artists.id, { onDelete: "cascade" }),
    idType: text("id_type").notNull(),
    idValue: text("id_value").notNull(),
    sourceService: text("source_service").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("idx_artist_external_ids_unique").on(table.artistId, table.idType, table.idValue, table.sourceService),
    index("idx_artist_external_ids_lookup").on(table.idType, table.idValue),
    index("idx_artist_external_ids_artist").on(table.artistId),
  ],
);

export const artistShortUrls = pgTable(
  "artist_short_urls",
  {
    id: text("id").primaryKey(),
    artistId: text("artist_id")
      .notNull()
      .references(() => artists.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  // Same rationale as idx_short_urls_track_id: LEFT JOIN in listArtists.
  (table) => [index("idx_artist_short_urls_artist_id").on(table.artistId)],
);

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

// Site-wide settings (key/value store)
export const siteSettings = pgTable("site_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

// Permanent cache for artist images (Spotify-backed). Used by genre-search
// and artist-info to avoid redundant Spotify lookups. No TTL — images are
// small URLs that don't change often enough to warrant expiry.
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
export const servicePlugins = pgTable("service_plugins", {
  id: text("id").primaryKey(),
  enabled: boolean("enabled").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

// Procedurally generated genre artworks. The grid endpoint serves one
// unique JPEG per genre, with a dominant accent color derived from the
// average color of the genre's top Last.fm album cover. First request
// generates and stores; subsequent requests hit this cache.
export const genreArtworks = pgTable("genre_artworks", {
  genreKey: text("genre_key").primaryKey(),
  jpeg: bytea("jpeg").notNull(),
  accentColor: text("accent_color").notNull(),
  sourceCoverUrl: text("source_cover_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

// Managed email templates. Created and edited via the dashboard email
// template editor; rendered to HTML by services/email-renderer.ts.
export const emailTemplates = pgTable("email_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  subject: text("subject").notNull().default(""),
  headerBannerUrl: text("header_banner_url"),
  headerText: text("header_text"),
  bodyText: text("body_text").notNull().default(""),
  footerBannerUrl: text("footer_banner_url"),
  footerText: text("footer_text"),
  isSystemTemplate: boolean("is_system_template").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type EmailTemplateRow = typeof emailTemplates.$inferSelect;
export type EmailTemplateInsert = typeof emailTemplates.$inferInsert;

// Managed content pages. Created and edited via the dashboard pages
// editor; rendered server-side by the Astro frontend at `/:slug`.
// `slug` is the natural primary key — it doubles as the public URL.
export const contentPages = pgTable("content_pages", {
  slug: text("slug").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  status: text("status").notNull().default("draft"),
  showTitle: boolean("show_title").notNull().default(true),
  titleAlignment: text("title_alignment").notNull().default("left"),
  pageType: text("page_type").notNull().default("default"),
  displayMode: text("display_mode").notNull().default("fullscreen"),
  overlayWidth: text("overlay_width").notNull().default("regular"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: text("created_by").references(() => adminUsers.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  updatedBy: text("updated_by").references(() => adminUsers.id, { onDelete: "set null" }),
  contentUpdatedAt: timestamp("content_updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ContentPageRow = typeof contentPages.$inferSelect;
export type ContentPageInsert = typeof contentPages.$inferInsert;

// Ordered segment list for pages with `page_type = 'segmented'`.
// Each segment references another content page (must be `page_type = 'default'`).
// Validation of that invariant lives in the service layer.
export const pageSegments = pgTable(
  "page_segments",
  {
    id: serial("id").primaryKey(),
    ownerSlug: text("owner_slug")
      .notNull()
      .references(() => contentPages.slug, { onDelete: "cascade", onUpdate: "cascade" }),
    targetSlug: text("target_slug")
      .notNull()
      .references(() => contentPages.slug, { onDelete: "cascade", onUpdate: "cascade" }),
    position: integer("position").notNull().default(0),
    label: text("label").notNull(),
    labelUpdatedAt: timestamp("label_updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_page_segments_owner").on(table.ownerSlug)],
);

export type PageSegmentRow = typeof pageSegments.$inferSelect;
export type PageSegmentInsert = typeof pageSegments.$inferInsert;

// Header / footer navigation items. Replaced atomically per `nav_id` by
// the admin nav editor. Items can either point at an internal content
// page (FK to `content_pages.slug`, cascades on delete) or carry an
// arbitrary URL (relative path or external https://). `position` is
// recomputed sequentially on every save.
export const navItems = pgTable(
  "nav_items",
  {
    id: serial("id").primaryKey(),
    navId: text("nav_id").notNull(),
    pageSlug: text("page_slug").references(() => contentPages.slug, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    url: text("url"),
    target: text("target").notNull().default("_self"),
    position: integer("position").notNull().default(0),
    label: text("label"),
    labelUpdatedAt: timestamp("label_updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_nav_items_nav").on(table.navId)],
);

export type NavItemRow = typeof navItems.$inferSelect;
export type NavItemInsert = typeof navItems.$inferInsert;

// Error/telemetry events posted by the Apple client (Testflight only).
// No foreign keys — entries must survive user/install churn so we can still
// correlate historical issues. `install_id` is an opaque random UUID the
// client keeps in its Keychain; it is not linked to any admin user.
export const appTelemetryEvents = pgTable(
  "app_telemetry_events",
  {
    id: serial("id").primaryKey(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    eventType: text("event_type").notNull(),
    eventTime: timestamp("event_time", { withTimezone: true }).notNull(),
    installId: text("install_id").notNull(),
    appVersion: text("app_version").notNull(),
    buildNumber: text("build_number").notNull(),
    platform: text("platform").notNull(),
    osVersion: text("os_version").notNull(),
    deviceModel: text("device_model").notNull(),
    locale: text("locale").notNull(),
    sourceUrl: text("source_url"),
    service: text("service"),
    errorKind: text("error_kind").notNull(),
    httpStatus: integer("http_status"),
    message: text("message").notNull(),
  },
  (table) => [
    index("idx_app_telemetry_received_at").on(table.receivedAt),
    index("idx_app_telemetry_install_received").on(table.installId, table.receivedAt),
  ],
);

export type AppTelemetryEventRow = typeof appTelemetryEvents.$inferSelect;
export type AppTelemetryEventInsert = typeof appTelemetryEvents.$inferInsert;

// Per-locale translations of a content page. Parent row in `content_pages`
// holds the default-locale (en) source of truth + fallback. Missing or
// `translation_ready=false` rows trigger fallback at render time.
export const contentPageTranslations = pgTable(
  "content_page_translations",
  {
    slug: text("slug")
      .notNull()
      .references(() => contentPages.slug, { onDelete: "cascade", onUpdate: "cascade" }),
    locale: text("locale").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    translationReady: boolean("translation_ready").notNull().default(false),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: text("updated_by").references(() => adminUsers.id, { onDelete: "set null" }),
  },
  (table) => [primaryKey({ name: "pk_content_page_translations", columns: [table.slug, table.locale] })],
);

export type ContentPageTranslationRow = typeof contentPageTranslations.$inferSelect;
export type ContentPageTranslationInsert = typeof contentPageTranslations.$inferInsert;

// Per-locale translation of a page segment's tab label.
export const pageSegmentTranslations = pgTable(
  "page_segment_translations",
  {
    segmentId: integer("segment_id")
      .notNull()
      .references(() => pageSegments.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    label: text("label").notNull(),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ name: "pk_page_segment_translations", columns: [table.segmentId, table.locale] })],
);

export type PageSegmentTranslationRow = typeof pageSegmentTranslations.$inferSelect;
export type PageSegmentTranslationInsert = typeof pageSegmentTranslations.$inferInsert;

// Per-locale translation of a navigation item's custom label.
export const navItemTranslations = pgTable(
  "nav_item_translations",
  {
    navItemId: integer("nav_item_id")
      .notNull()
      .references(() => navItems.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    label: text("label").notNull(),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ name: "pk_nav_item_translations", columns: [table.navItemId, table.locale] })],
);

export type NavItemTranslationRow = typeof navItemTranslations.$inferSelect;
export type NavItemTranslationInsert = typeof navItemTranslations.$inferInsert;

// Per-source crawler state. Populated lazily on heartbeat tick via
// idempotent ON CONFLICT DO NOTHING upsert from the in-memory registry —
// adding a new source costs zero migration work. Mutable fields
// (`enabled`, `intervalMinutes`, `config`, `cursor`) are written from the
// admin API at runtime; transient fields (`runningSince`, `lastRunAt`,
// `nextRunAt`, `consecutiveErrors`, `lastError`) are written by the
// heartbeat itself. Partial index on `nextRunAt WHERE enabled = true`
// keeps the per-minute "is anything due?" probe O(log n_active).
export const crawlState = pgTable(
  "crawl_state",
  {
    source: text("source").primaryKey(),
    displayName: text("display_name").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    intervalMinutes: integer("interval_minutes").notNull().default(360),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull().defaultNow(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    cursor: jsonb("cursor"),
    config: jsonb("config").notNull().default({}),
    runningSince: timestamp("running_since", { withTimezone: true }),
    errorCount: integer("error_count").notNull().default(0),
    lastError: text("last_error"),
    consecutiveErrors: integer("consecutive_errors").notNull().default(0),
  },
  (table) => [index("idx_crawl_state_due").on(table.nextRunAt).where(sql`${table.enabled} = true`)],
);

export type CrawlStateRow = typeof crawlState.$inferSelect;
export type CrawlStateInsert = typeof crawlState.$inferInsert;

// Per-tick observability log. One row per source per heartbeat tick that
// did real work (skipped/locked ticks are recorded as `status = 'skipped'`
// only when a tick was actually attempted but lock acquisition failed —
// purely-idle minutes write nothing). Counters get finalized in the same
// transaction as the `crawl_state` update.
export const crawlRuns = pgTable(
  "crawl_runs",
  {
    id: text("id").primaryKey(),
    source: text("source").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: text("status").notNull(), // 'running' | 'success' | 'error' | 'aborted' | 'skipped'
    discovered: integer("discovered").notNull().default(0),
    ingested: integer("ingested").notNull().default(0),
    skipped: integer("skipped").notNull().default(0),
    errors: integer("errors").notNull().default(0),
    notes: text("notes"),
  },
  (table) => [index("idx_crawl_runs_source_started").on(table.source, table.startedAt.desc())],
);

export type CrawlRunRow = typeof crawlRuns.$inferSelect;
export type CrawlRunInsert = typeof crawlRuns.$inferInsert;
