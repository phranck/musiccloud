import type { FormConfigPayload } from "@musiccloud/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  date,
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

// ─── Normalized Artist Identity Tables ───────────────────────────────────────

/**
 * Normalized artist identity root table.
 * Represents people, groups, personas and unresolved candidates that tracks,
 * albums, names, identifiers and memberships attach to.
 */
export const artistEntities = pgTable(
  "artist_entities",
  {
    id: text("id").primaryKey(),
    entityType: text("entity_type").notNull().default("unknown"),
    verificationStatus: text("verification_status").notNull().default("candidate"),
    confidence: real("confidence"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_artist_entities_type_status").on(table.entityType, table.verificationStatus),
    check("chk_artist_entities_entity_type", sql`${table.entityType} IN ('person', 'group', 'persona', 'unknown')`),
    check(
      "chk_artist_entities_verification_status",
      sql`${table.verificationStatus} IN ('candidate', 'verified', 'rejected')`,
    ),
  ],
);

/**
 * Provenance records for external artist identity sources.
 * Tracks provider entity ids, source URLs, confidence and fetch time for
 * normalized artist facts imported from third-party catalogues.
 */
export const artistSources = pgTable(
  "artist_sources",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    providerEntityId: text("provider_entity_id"),
    sourceUrl: text("source_url"),
    confidence: real("confidence"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_artist_sources_provider_entity").on(table.provider, table.providerEntityId),
    index("idx_artist_sources_fetched_at").on(table.fetchedAt),
  ],
);

/**
 * Raw JSON payload archive for artist source records.
 * Cascades with `artistSources` and keeps source-specific evidence out of
 * the normalized identity tables.
 */
export const artistSourcePayloads = pgTable("artist_source_payloads", {
  sourceId: text("source_id")
    .primaryKey()
    .references(() => artistSources.id, { onDelete: "cascade" }),
  rawPayload: jsonb("raw_payload").notNull(),
});

/**
 * External identifiers attached to normalized artist entities.
 * Enforces provider-level uniqueness while allowing each identifier to keep
 * source provenance and optional canonical external URL.
 */
export const artistEntityIdentifiers = pgTable(
  "artist_entity_identifiers",
  {
    id: text("id").primaryKey(),
    artistEntityId: text("artist_entity_id")
      .notNull()
      .references(() => artistEntities.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    externalUrl: text("external_url"),
    sourceId: text("source_id").references(() => artistSources.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_artist_entity_identifiers_provider_external").on(table.provider, table.externalId),
    uniqueIndex("idx_artist_entity_identifiers_entity_provider_external").on(
      table.artistEntityId,
      table.provider,
      table.externalId,
    ),
    index("idx_artist_entity_identifiers_entity").on(table.artistEntityId),
  ],
);

/**
 * Localized and typed names for artist entities.
 * Stores canonical names, aliases, legal names, stage names, credit names and
 * sort names used by resolver display and admin identity queries.
 */
export const artistEntityNames = pgTable(
  "artist_entity_names",
  {
    id: text("id").primaryKey(),
    artistEntityId: text("artist_entity_id")
      .notNull()
      .references(() => artistEntities.id, { onDelete: "cascade" }),
    locale: text("locale"),
    name: text("name").notNull(),
    nameType: text("name_type").notNull().default("alias"),
    sourceId: text("source_id").references(() => artistSources.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_artist_entity_names_entity_locale_type").on(table.artistEntityId, table.locale, table.nameType),
    index("idx_artist_entity_names_name_type").on(table.nameType),
    index("idx_artist_entity_names_lower_name").on(sql`lower(${table.name})`, table.artistEntityId),
    index("idx_artist_entity_names_name_trgm").using("gin", table.name.op("gin_trgm_ops")),
    index("idx_artist_entity_names_entity_lower_type").on(
      table.artistEntityId,
      sql`lower(${table.name})`,
      table.nameType,
    ),
    check(
      "chk_artist_entity_names_name_type",
      sql`${table.nameType} IN ('canonical', 'alias', 'legal', 'stage', 'credit', 'sort')`,
    ),
  ],
);

/**
 * Localized descriptive text snippets for artist entities.
 * Holds biography-style text such as descriptions and short bios with source
 * provenance and update timestamps.
 */
export const artistEntityTexts = pgTable(
  "artist_entity_texts",
  {
    id: text("id").primaryKey(),
    artistEntityId: text("artist_entity_id")
      .notNull()
      .references(() => artistEntities.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    textType: text("text_type").notNull(),
    content: text("content").notNull(),
    sourceId: text("source_id").references(() => artistSources.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_artist_entity_texts_unique").on(
      table.artistEntityId,
      table.locale,
      table.textType,
      table.sourceId,
    ),
    index("idx_artist_entity_texts_entity_locale").on(table.artistEntityId, table.locale),
    check("chk_artist_entity_texts_text_type", sql`${table.textType} IN ('description', 'short_bio')`),
  ],
);

/**
 * Normalized geographical places referenced by artist identity events.
 * Stores optional country and coordinates; localized names and external ids
 * live in `placeNames` and `placeIdentifiers`.
 */
export const places = pgTable("places", {
  id: text("id").primaryKey(),
  countryCode: text("country_code"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Localized display names for normalized places.
 * Supports source-provenanced place labels used by artist birth, death and
 * group-formation events.
 */
export const placeNames = pgTable(
  "place_names",
  {
    id: text("id").primaryKey(),
    placeId: text("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    locale: text("locale"),
    name: text("name").notNull(),
    sourceId: text("source_id").references(() => artistSources.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_place_names_place_locale").on(table.placeId, table.locale),
    index("idx_place_names_name").on(table.name),
  ],
);

/**
 * External identifiers attached to normalized places.
 * Keeps provider ids and URLs for locations imported with artist identity
 * facts.
 */
export const placeIdentifiers = pgTable(
  "place_identifiers",
  {
    id: text("id").primaryKey(),
    placeId: text("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    externalUrl: text("external_url"),
    sourceId: text("source_id").references(() => artistSources.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_place_identifiers_provider_external").on(table.provider, table.externalId),
    index("idx_place_identifiers_place").on(table.placeId),
  ],
);

/**
 * Dated lifecycle events for artist entities.
 * Stores births, deaths, group formations and disbandments with precision
 * columns optimized for "on this day" queries.
 */
export const artistEntityEvents = pgTable(
  "artist_entity_events",
  {
    id: text("id").primaryKey(),
    artistEntityId: text("artist_entity_id")
      .notNull()
      .references(() => artistEntities.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    dateValue: date("date_value"),
    datePrecision: text("date_precision").notNull().default("unknown"),
    eventYear: integer("event_year"),
    eventMonth: integer("event_month"),
    eventDay: integer("event_day"),
    placeId: text("place_id").references(() => places.id, { onDelete: "set null" }),
    sourceId: text("source_id").references(() => artistSources.id, { onDelete: "set null" }),
    confidence: real("confidence"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_artist_entity_events_today")
      .on(table.eventType, table.eventMonth, table.eventDay)
      .where(sql`${table.datePrecision} = 'day'`),
    index("idx_artist_entity_events_entity_type").on(table.artistEntityId, table.eventType),
    index("idx_artist_entity_events_type_year").on(table.eventType, table.eventYear),
    check("chk_artist_entity_events_event_type", sql`${table.eventType} IN ('birth', 'death', 'formed', 'disbanded')`),
    check(
      "chk_artist_entity_events_date_precision",
      sql`${table.datePrecision} IN ('year', 'month', 'day', 'unknown')`,
    ),
    check("chk_artist_entity_events_month", sql`${table.eventMonth} IS NULL OR ${table.eventMonth} BETWEEN 1 AND 12`),
    check("chk_artist_entity_events_day", sql`${table.eventDay} IS NULL OR ${table.eventDay} BETWEEN 1 AND 31`),
  ],
);

/**
 * Membership edges between group artist entities and member entities.
 * Captures date ranges, current-membership state, source provenance and
 * confidence for group/person relationship queries.
 */
export const artistGroupMemberships = pgTable(
  "artist_group_memberships",
  {
    id: text("id").primaryKey(),
    groupArtistEntityId: text("group_artist_entity_id")
      .notNull()
      .references(() => artistEntities.id, { onDelete: "cascade" }),
    memberArtistEntityId: text("member_artist_entity_id")
      .notNull()
      .references(() => artistEntities.id, { onDelete: "cascade" }),
    memberNameCredit: text("member_name_credit"),
    beginDate: date("begin_date"),
    beginDatePrecision: text("begin_date_precision").notNull().default("unknown"),
    beginYear: integer("begin_year"),
    beginMonth: integer("begin_month"),
    beginDay: integer("begin_day"),
    endDate: date("end_date"),
    endDatePrecision: text("end_date_precision").notNull().default("unknown"),
    endYear: integer("end_year"),
    endMonth: integer("end_month"),
    endDay: integer("end_day"),
    isCurrent: boolean("is_current"),
    sourceId: text("source_id").references(() => artistSources.id, { onDelete: "set null" }),
    confidence: real("confidence"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_artist_group_memberships_group").on(table.groupArtistEntityId),
    index("idx_artist_group_memberships_member").on(table.memberArtistEntityId),
    index("idx_artist_group_memberships_current_group")
      .on(table.groupArtistEntityId, table.isCurrent)
      .where(sql`${table.isCurrent} = true`),
    check("chk_artist_group_memberships_not_self", sql`${table.groupArtistEntityId} <> ${table.memberArtistEntityId}`),
    check(
      "chk_artist_group_memberships_begin_precision",
      sql`${table.beginDatePrecision} IN ('year', 'month', 'day', 'unknown')`,
    ),
    check(
      "chk_artist_group_memberships_end_precision",
      sql`${table.endDatePrecision} IN ('year', 'month', 'day', 'unknown')`,
    ),
    check(
      "chk_artist_group_memberships_begin_month",
      sql`${table.beginMonth} IS NULL OR ${table.beginMonth} BETWEEN 1 AND 12`,
    ),
    check(
      "chk_artist_group_memberships_end_month",
      sql`${table.endMonth} IS NULL OR ${table.endMonth} BETWEEN 1 AND 12`,
    ),
    check(
      "chk_artist_group_memberships_begin_day",
      sql`${table.beginDay} IS NULL OR ${table.beginDay} BETWEEN 1 AND 31`,
    ),
    check("chk_artist_group_memberships_end_day", sql`${table.endDay} IS NULL OR ${table.endDay} BETWEEN 1 AND 31`),
  ],
);

/**
 * Role labels attached to artist group memberships.
 * Composite primary key allows multiple distinct roles per membership without
 * duplicate role rows.
 */
export const artistGroupMembershipRoles = pgTable(
  "artist_group_membership_roles",
  {
    membershipId: text("membership_id")
      .notNull()
      .references(() => artistGroupMemberships.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
  },
  (table) => [primaryKey({ name: "pk_artist_group_membership_roles", columns: [table.membershipId, table.role] })],
);

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

/**
 * Dashboard administrator accounts and invite state.
 * Stores authentication hashes, profile fields, locale, role and optional
 * session timeout configuration for admin-only routes.
 */
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
/**
 * Cached artist-info payloads from external enrichment services.
 * Stores JSON profile, top-track and event payloads with independent freshness
 * timestamps for lazy refreshes.
 */
export const artistCache = pgTable(
  "artist_cache",
  {
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
  },
  (table) => [index("idx_artist_cache_updated_at").on(table.updatedAt)],
);

// Site-wide settings (key/value store)
/**
 * Site-wide key/value settings edited through the dashboard.
 * The key is the natural primary key and values are stored as serialized text.
 */
export const siteSettings = pgTable("site_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

// Permanent cache for artist images (Spotify-backed). Used by genre-search
// and artist-info to avoid redundant Spotify lookups. No TTL — images are
// small URLs that don't change often enough to warrant expiry.
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

// Managed email templates. Created and edited via the dashboard email
// template editor; rendered to HTML by services/email-renderer.ts.
/**
 * Managed email templates edited through the dashboard.
 *
 * Stores the block-based body (`blocks`), subject, and a system-template flag
 * for protected built-in templates. A template's expected `{{var}}` variables
 * are auto-extracted from its subject + body at use time (MC-080), not stored.
 * The nine trailing branding columns are per-template overrides
 * (MC-079): each is nullable, and `NULL` means "no override — inherit the
 * corresponding {@link emailBranding} global default for this render". A
 * non-null value wins over the global default for that one field only (merge
 * logic lives in `email-renderer.ts`'s `resolveBranding`).
 */
export const emailTemplates = pgTable("email_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  subject: text("subject").notNull().default(""),
  isSystemTemplate: boolean("is_system_template").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  blocks: jsonb("blocks").notNull().default([]),
  // Per-template branding overrides (MC-079). All nullable: NULL = inherit the
  // matching global emailBranding default for this field.
  headerAssetId: text("header_asset_id").references(() => emailAssets.id, { onDelete: "set null" }),
  footerAssetId: text("footer_asset_id").references(() => emailAssets.id, { onDelete: "set null" }),
  footerText: text("footer_text"),
  lightBackgroundAssetId: text("light_background_asset_id").references(() => emailAssets.id, { onDelete: "set null" }),
  darkBackgroundAssetId: text("dark_background_asset_id").references(() => emailAssets.id, { onDelete: "set null" }),
  lightGradientTop: text("light_gradient_top"),
  lightGradientBottom: text("light_gradient_bottom"),
  darkGradientTop: text("dark_gradient_top"),
  darkGradientBottom: text("dark_gradient_bottom"),
});

export type EmailTemplateRow = typeof emailTemplates.$inferSelect;
export type EmailTemplateInsert = typeof emailTemplates.$inferInsert;

/**
 * Global email branding (MC-078, extended MC-079): a single row carrying the
 * default header/footer assets, footer text, and day/night page background
 * (gradient + optional image) applied to every rendered template UNLESS the
 * template overrides the matching field (see {@link emailTemplates}). The app
 * always reads/writes the lowest-id row; the migration seeds exactly one.
 *
 * The four gradient columns are NOT NULL with the real website night-sky
 * shader defaults (`apps/frontend/src/components/background/nightSky/settings.ts`):
 * a gradient always needs two colours to render, so there is no nullable
 * fallback chain here — a fresh setup already looks coherent without any admin
 * action. The two background-image asset ids stay nullable (no image until the
 * user uploads one; the gradient alone renders in the meantime).
 */
export const emailBranding = pgTable("email_branding", {
  id: serial("id").primaryKey(),
  headerAssetId: text("header_asset_id").references(() => emailAssets.id, { onDelete: "set null" }),
  footerAssetId: text("footer_asset_id").references(() => emailAssets.id, { onDelete: "set null" }),
  footerText: text("footer_text"),
  lightBackgroundAssetId: text("light_background_asset_id").references(() => emailAssets.id, { onDelete: "set null" }),
  darkBackgroundAssetId: text("dark_background_asset_id").references(() => emailAssets.id, { onDelete: "set null" }),
  lightGradientTop: text("light_gradient_top").notNull().default("#0076d5"),
  lightGradientBottom: text("light_gradient_bottom").notNull().default("#69d1fd"),
  darkGradientTop: text("dark_gradient_top").notNull().default("#0b1318"),
  darkGradientBottom: text("dark_gradient_bottom").notNull().default("#10273b"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EmailBrandingRow = typeof emailBranding.$inferSelect;
export type EmailBrandingInsert = typeof emailBranding.$inferInsert;

/**
 * Binary email images (MC-078). Mirrors {@link genreArtworks}: bytes live in
 * Postgres, served by `GET /api/admin/email-assets/:id` with a long immutable
 * cache. Referenced by {@link emailBranding} and by `image` body-blocks.
 */
export const emailAssets = pgTable("email_assets", {
  id: text("id").primaryKey(),
  mimeType: text("mime_type").notNull(),
  bytes: bytea("bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EmailAssetRow = typeof emailAssets.$inferSelect;
export type EmailAssetInsert = typeof emailAssets.$inferInsert;

/**
 * Binds a system action (code-defined, see `@musiccloud/shared` EMAIL_ACTIONS)
 * to a template (MC-078). Many-to-many: one action fans out to every enabled
 * binding's template; a template may be bound to several actions.
 */
export const emailActionBindings = pgTable(
  "email_action_bindings",
  {
    id: text("id").primaryKey(),
    actionKey: text("action_key").notNull(),
    templateId: integer("template_id")
      .notNull()
      .references(() => emailTemplates.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_email_action_bindings_action_template").on(table.actionKey, table.templateId),
    index("idx_email_action_bindings_action").on(table.actionKey),
  ],
);

export type EmailActionBindingRow = typeof emailActionBindings.$inferSelect;
export type EmailActionBindingInsert = typeof emailActionBindings.$inferInsert;

/**
 * Admin-built forms (MC-082, ported from lmaa.space): the whole field grid
 * plus submission chain lives as one `FormConfigPayload` JSON in `config`;
 * `name` is the stable admin-facing identifier, `slug` the public URL path
 * the form is served under (both unique).
 */
export const formConfigs = pgTable("form_configs", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").unique(),
  config: jsonb("config").$type<FormConfigPayload>().notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FormConfigRow = typeof formConfigs.$inferSelect;
export type FormConfigInsert = typeof formConfigs.$inferInsert;

/**
 * Generic form submissions stored by the submission chain's `store` step.
 * `submitter_email` and `developer_account_id` are nullable GDPR anchors
 * (MC-082): they let a future export/erase service find every submission a
 * person is connected to, whether or not they hold an account.
 */
export const formSubmissions = pgTable(
  "form_submissions",
  {
    id: serial("id").primaryKey(),
    formConfigId: integer("form_config_id")
      .notNull()
      .references(() => formConfigs.id, { onDelete: "cascade" }),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    submitterEmail: text("submitter_email"),
    developerAccountId: text("developer_account_id").references(() => developerAccounts.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_form_submissions_form").on(table.formConfigId),
    index("idx_form_submissions_submitter_email").on(table.submitterEmail),
    index("idx_form_submissions_developer_account").on(table.developerAccountId),
  ],
);

export type FormSubmissionRow = typeof formSubmissions.$inferSelect;
export type FormSubmissionInsert = typeof formSubmissions.$inferInsert;

// Managed content pages. Created and edited via the dashboard pages
// editor; rendered server-side by the Astro frontend at `/:slug`.
// `slug` is the natural primary key — it doubles as the public URL.
/**
 * Managed content pages rendered by the public Astro frontend.
 * Uses `slug` as both primary key and public URL, with layout/display fields
 * and audit pointers for dashboard edits.
 */
export const contentPages = pgTable(
  "content_pages",
  {
    slug: text("slug").primaryKey(),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    status: text("status").notNull().default("draft"),
    showTitle: boolean("show_title").notNull().default(true),
    titleAlignment: text("title_alignment").notNull().default("left"),
    pageType: text("page_type").notNull().default("default"),
    displayMode: text("display_mode").notNull().default("fullscreen"),
    overlayWidth: text("overlay_width").notNull().default("regular"),
    contentCardStyle: text("content_card_style").notNull().default("recessed"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: text("created_by").references(() => adminUsers.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    updatedBy: text("updated_by").references(() => adminUsers.id, { onDelete: "set null" }),
    contentUpdatedAt: timestamp("content_updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_content_pages_status_title").on(table.status, table.title),
    index("idx_content_pages_position_created").on(table.position, table.createdAt.desc()),
  ],
);

export type ContentPageRow = typeof contentPages.$inferSelect;
export type ContentPageInsert = typeof contentPages.$inferInsert;

// Ordered segment list for pages with `page_type = 'segmented'`.
// Each segment references another content page (must be `page_type = 'default'`).
// Validation of that invariant lives in the service layer.
/**
 * Ordered child-page references for segmented content pages.
 * Each row connects an owner page to a target page with a tab label and
 * position managed by the dashboard.
 */
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
  (table) => [
    index("idx_page_segments_owner").on(table.ownerSlug),
    index("idx_page_segments_owner_position").on(table.ownerSlug, table.position),
  ],
);

export type PageSegmentRow = typeof pageSegments.$inferSelect;
export type PageSegmentInsert = typeof pageSegments.$inferInsert;

// Header / footer navigation items. Replaced atomically per `nav_id` by
// the admin nav editor. Items can either point at an internal content
// page (FK to `content_pages.slug`, cascades on delete) or carry an
// arbitrary URL (relative path or external https://). `position` is
// recomputed sequentially on every save.
/**
 * Header and footer navigation items managed by the dashboard.
 * Rows are replaced atomically per nav id and can target either content pages
 * or arbitrary URLs.
 */
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
  (table) => [
    index("idx_nav_items_nav").on(table.navId),
    index("idx_nav_items_nav_position").on(table.navId, table.position),
  ],
);

export type NavItemRow = typeof navItems.$inferSelect;
export type NavItemInsert = typeof navItems.$inferInsert;

// Error/telemetry events posted by the Apple client (Testflight only).
// No foreign keys — entries must survive user/install churn so we can still
// correlate historical issues. `install_id` is an opaque random UUID the
// client keeps in its Keychain; it is not linked to any admin user.
/**
 * Native app telemetry events submitted by the Apple client.
 * Keeps install-scoped diagnostics and resolve errors without foreign keys so
 * historical entries survive account or install churn.
 */
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
// holds the default-locale (en) source of truth + fallback. Missing rows
// trigger fallback at render time.
/**
 * Per-locale translations for managed content pages.
 * The parent `contentPages` row remains the default-locale source of truth and
 * missing locales fall back at render time.
 */
export const contentPageTranslations = pgTable(
  "content_page_translations",
  {
    slug: text("slug")
      .notNull()
      .references(() => contentPages.slug, { onDelete: "cascade", onUpdate: "cascade" }),
    locale: text("locale").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: text("updated_by").references(() => adminUsers.id, { onDelete: "set null" }),
  },
  (table) => [primaryKey({ name: "pk_content_page_translations", columns: [table.slug, table.locale] })],
);

export type ContentPageTranslationRow = typeof contentPageTranslations.$inferSelect;
export type ContentPageTranslationInsert = typeof contentPageTranslations.$inferInsert;

// Per-locale translation of a page segment's tab label.
/**
 * Per-locale translations for segmented-page tab labels.
 * Composite primary key keeps one translated label per segment and locale.
 */
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
/**
 * Per-locale translations for navigation item labels.
 * Composite primary key keeps one translated label per navigation item and
 * locale.
 */
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
/**
 * Mutable scheduler state for each registered crawler source.
 * Seeded idempotently from the in-memory source registry and updated by the
 * admin API and heartbeat runner.
 */
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
/**
 * Historical crawler heartbeat run records.
 * Captures per-tick status, counters and notes for admin observability and
 * debugging of background ingestion sources.
 */
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
  (table) => [
    index("idx_crawl_runs_source_started").on(table.source, table.startedAt.desc()),
    index("idx_crawl_runs_started_at").on(table.startedAt.desc()),
  ],
);

export type CrawlRunRow = typeof crawlRuns.$inferSelect;
export type CrawlRunInsert = typeof crawlRuns.$inferInsert;

// ============================================================================
// CREATIVE COMMONS (Jamendo) — separate entity families, no commercial overlap
// ============================================================================

/**
 * Creative-Commons artists resolved from Jamendo.
 * Slim by design: a single localized bio blob, no normalized identity graph.
 */
export const ccArtists = pgTable(
  "cc_artists",
  {
    id: text("id").primaryKey(),
    jamendoId: text("jamendo_id").notNull(),
    name: text("name").notNull(),
    imageUrl: text("image_url"),
    website: text("website"),
    bio: jsonb("bio"), // localized { en, de, ... }
    shareUrl: text("share_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [uniqueIndex("uq_cc_artists_jamendo_id").on(table.jamendoId), index("idx_cc_artists_name").on(table.name)],
);

/**
 * Creative-Commons albums resolved from Jamendo.
 */
export const ccAlbums = pgTable(
  "cc_albums",
  {
    id: text("id").primaryKey(),
    jamendoId: text("jamendo_id").notNull(),
    name: text("name").notNull(),
    ccArtistId: text("cc_artist_id").references(() => ccArtists.id),
    artworkUrl: text("artwork_url"),
    releaseDate: text("release_date"),
    zipUrl: text("zip_url"),
    shareUrl: text("share_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("uq_cc_albums_jamendo_id").on(table.jamendoId),
    index("idx_cc_albums_cc_artist_id").on(table.ccArtistId),
  ],
);

/**
 * Creative-Commons tracks resolved from Jamendo.
 * `stream_url` is the permanent full-track stream (no expiry, unlike commercial
 * previews). `download_allowed` mirrors Jamendo's `audiodownload_allowed`.
 */
export const ccTracks = pgTable(
  "cc_tracks",
  {
    id: text("id").primaryKey(),
    jamendoId: text("jamendo_id").notNull(),
    title: text("title").notNull(),
    artistName: text("artist_name").notNull(),
    ccArtistId: text("cc_artist_id").references(() => ccArtists.id),
    albumName: text("album_name"),
    ccAlbumId: text("cc_album_id").references(() => ccAlbums.id),
    artworkUrl: text("artwork_url"),
    durationMs: integer("duration_ms"),
    releaseDate: text("release_date"),
    licenseCcurl: text("license_ccurl"),
    streamUrl: text("stream_url").notNull(),
    downloadUrl: text("download_url"),
    downloadAllowed: integer("download_allowed"),
    waveform: text("waveform"),
    shareUrl: text("share_url"),
    // 1-based position within an album's tracklist; set when this track is
    // persisted as part of an album resolve, NULL for standalone single resolves.
    albumPosition: integer("album_position"),
    // 0-based rank within its artist's popularity-ordered top-tracks; set when
    // persisted as part of an artist resolve, NULL otherwise.
    artistTopPosition: integer("artist_top_position"),
    // `include=musicinfo` classification + `include=stats` counters, captured at
    // single-track resolve so the share page renders the details card from the DB.
    musicInfo: jsonb("music_info"),
    stats: jsonb("stats"),
    // Jamendo Pro licensing flag (0/1) + page URL (`include=licenses`).
    proLicensing: integer("pro_licensing"),
    proUrl: text("pro_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("uq_cc_tracks_jamendo_id").on(table.jamendoId),
    index("idx_cc_tracks_cc_artist_id").on(table.ccArtistId),
    index("idx_cc_tracks_cc_album_id").on(table.ccAlbumId),
    index("idx_cc_tracks_title").on(table.title),
    index("idx_cc_tracks_created_at").on(table.createdAt.desc()),
  ],
);

/**
 * Public short-code mapping for CC track share pages.
 * Mirrors the commercial `short_urls` pattern (`id` is the code, one per track),
 * but is created eagerly on track persistence so every CC track is immediately
 * shareable and playlist-ready.
 */
export const ccShortUrls = pgTable(
  "cc_short_urls",
  {
    id: text("id").primaryKey(),
    ccTrackId: text("cc_track_id")
      .notNull()
      .references(() => ccTracks.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("idx_cc_short_urls_cc_track_id").on(table.ccTrackId),
    uniqueIndex("uq_cc_short_urls_cc_track_id").on(table.ccTrackId),
  ],
);

/**
 * Public short-code mapping for CC album share pages.
 * Mirrors {@link ccShortUrls} (one stable code per entity, eager mint), but keyed
 * to a CC album so a resolved CC album is immediately shareable.
 */
export const ccAlbumShortUrls = pgTable(
  "cc_album_short_urls",
  {
    id: text("id").primaryKey(),
    ccAlbumId: text("cc_album_id")
      .notNull()
      .references(() => ccAlbums.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("idx_cc_album_short_urls_cc_album_id").on(table.ccAlbumId),
    uniqueIndex("uq_cc_album_short_urls_cc_album_id").on(table.ccAlbumId),
  ],
);

/**
 * Public short-code mapping for CC artist share pages.
 * Mirrors {@link ccShortUrls} (one stable code per entity, eager mint), but keyed
 * to a CC artist so a resolved CC artist is immediately shareable.
 */
export const ccArtistShortUrls = pgTable(
  "cc_artist_short_urls",
  {
    id: text("id").primaryKey(),
    ccArtistId: text("cc_artist_id")
      .notNull()
      .references(() => ccArtists.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("idx_cc_artist_short_urls_cc_artist_id").on(table.ccArtistId),
    uniqueIndex("uq_cc_artist_short_urls_cc_artist_id").on(table.ccArtistId),
  ],
);

// ============================================================================
// DEVELOPER ACCOUNTS (developer.musiccloud.io self-service, MC-064)
// ============================================================================

/**
 * External developer accounts for the developer portal, kept entirely
 * separate from {@link adminUsers}. Backs the email/password auth flow
 * (signup, verification, login, password reset) and acts as the owning
 * entity for {@link developerIdentities} and {@link developerEmailTokens}.
 *
 * `passwordHash` is nullable to leave room for pure OAuth accounts added in
 * MC-065; an email/password account always carries a hash. `emailVerifiedAt`
 * gates login: it stays `null` until the verification token is consumed.
 */
export const developerAccounts = pgTable(
  "developer_accounts",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull().unique(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    passwordHash: text("password_hash"),
    displayName: text("display_name"),
    avatarUrl: text("avatar_url"),
    plan: text("plan").notNull().default("free"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (table) => [
    check("chk_developer_accounts_plan", sql`${table.plan} IN ('free')`),
    check("chk_developer_accounts_status", sql`${table.status} IN ('active', 'suspended')`),
  ],
);

export type DeveloperAccountRow = typeof developerAccounts.$inferSelect;
export type DeveloperAccountInsert = typeof developerAccounts.$inferInsert;

/**
 * Authentication identities linked to a {@link developerAccounts} row. Each
 * row records how an account can authenticate: `provider = 'email'` for the
 * built-in email/password path (with a `null` `providerUserId`), or
 * `provider = 'github'` for the OAuth path added in MC-065 (with the GitHub
 * user id in `providerUserId`).
 *
 * The first unique index keeps a single identity per provider per account;
 * the second prevents two accounts from claiming the same external provider
 * id. In Postgres, `NULL` values are distinct under a unique index, so
 * multiple `(github, NULL)` placeholders never collide.
 */
export const developerIdentities = pgTable(
  "developer_identities",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => developerAccounts.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerUserId: text("provider_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_developer_identities_account_provider").on(table.accountId, table.provider),
    uniqueIndex("uq_developer_identities_provider_user").on(table.provider, table.providerUserId),
    check("chk_developer_identities_provider", sql`${table.provider} IN ('email', 'github')`),
  ],
);

export type DeveloperIdentityRow = typeof developerIdentities.$inferSelect;
export type DeveloperIdentityInsert = typeof developerIdentities.$inferInsert;

/**
 * Single-use, hashed email tokens for developer account verification and
 * password reset. The raw token is only ever sent in the email link; this
 * table stores the SHA-256 hash. A token is valid while `expiresAt` is in the
 * future and `consumedAt` is `null`; consuming it stamps `consumedAt` so it
 * cannot be replayed. Rows cascade-delete with their owning account.
 */
export const developerEmailTokens = pgTable(
  "developer_email_tokens",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => developerAccounts.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_developer_email_tokens_token_hash").on(table.tokenHash),
    check("chk_developer_email_tokens_purpose", sql`${table.purpose} IN ('verify', 'reset')`),
  ],
);

export type DeveloperEmailTokenRow = typeof developerEmailTokens.$inferSelect;
export type DeveloperEmailTokenInsert = typeof developerEmailTokens.$inferInsert;

/**
 * A developer's request for Public-API access (MC-025/MC-077). Each row
 * describes one app; `developerAccountId` is the source of truth for who
 * submitted it (`contactEmail` is a display snapshot, not the identity).
 * Approval creates exactly one new {@link apiClients} row per request —
 * requests are never merged into an existing client.
 */
export const apiAccessRequests = pgTable(
  "api_access_requests",
  {
    id: text("id").primaryKey(),
    developerAccountId: text("developer_account_id")
      .notNull()
      .references(() => developerAccounts.id, { onDelete: "cascade" }),
    contactEmail: text("contact_email").notNull(),
    appName: text("app_name").notNull(),
    appDescription: text("app_description").notNull(),
    estimatedRequestsPerDay: integer("estimated_requests_per_day").notNull(),
    status: text("status").notNull().default("pending"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedByAdminId: text("reviewed_by_admin_id").references(() => adminUsers.id, { onDelete: "set null" }),
    reviewNote: text("review_note"),
  },
  (table) => [
    index("idx_api_access_requests_status_submitted").on(table.status, table.submittedAt),
    index("idx_api_access_requests_developer_account").on(table.developerAccountId),
    check("chk_api_access_requests_status", sql`${table.status} IN ('pending', 'approved', 'rejected', 'archived')`),
    check("chk_api_access_requests_estimated_requests", sql`${table.estimatedRequestsPerDay} > 0`),
  ],
);

export type ApiAccessRequestRow = typeof apiAccessRequests.$inferSelect;
export type ApiAccessRequestInsert = typeof apiAccessRequests.$inferInsert;

/**
 * An approved API consumer ("app"). Linked to the developer account that
 * owns it and, when created via the request flow, to the originating
 * {@link apiAccessRequests} row. `requestsPerMinute`/`requestsPerDay` are
 * free-tier defaults, editable by an admin — not yet enforced anywhere
 * (Public-API enforcement is MC-025 Phase 2).
 */
export const apiClients = pgTable(
  "api_clients",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id").references(() => apiAccessRequests.id, { onDelete: "set null" }),
    developerAccountId: text("developer_account_id")
      .notNull()
      .references(() => developerAccounts.id, { onDelete: "cascade" }),
    appName: text("app_name").notNull(),
    contactEmail: text("contact_email").notNull(),
    description: text("description").notNull(),
    status: text("status").notNull().default("active"),
    requestsPerMinute: integer("requests_per_minute").notNull().default(60),
    requestsPerDay: integer("requests_per_day").notNull().default(10000),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdByAdminId: text("created_by_admin_id").references(() => adminUsers.id, { onDelete: "set null" }),
  },
  (table) => [
    index("idx_api_clients_status").on(table.status),
    index("idx_api_clients_developer_account").on(table.developerAccountId),
    check("chk_api_clients_status", sql`${table.status} IN ('active', 'suspended', 'revoked')`),
    check("chk_api_clients_requests_per_minute", sql`${table.requestsPerMinute} > 0`),
    check("chk_api_clients_requests_per_day", sql`${table.requestsPerDay} > 0`),
  ],
);

export type ApiClientRow = typeof apiClients.$inferSelect;
export type ApiClientInsert = typeof apiClients.$inferInsert;

/**
 * An issued bearer token for an {@link apiClients} row, sent as
 * `X-API-Key: mc_live_<prefix>_<secret>`. Only the SHA-256 hash is
 * persisted (`tokenHash`); `tokenPrefix` is safe to display. Both admins
 * and the owning developer can create/revoke/rotate tokens — see
 * `api-access-repository.ts`. `rotatedFromTokenId` is informational only
 * (no FK constraint, to avoid a self-referential-FK typing detour for a
 * field that is never used for integrity checks, only display history).
 */
export const apiClientTokens = pgTable(
  "api_client_tokens",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => apiClients.id, { onDelete: "cascade" }),
    tokenPrefix: text("token_prefix").notNull(),
    tokenHash: text("token_hash").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    rotatedFromTokenId: text("rotated_from_token_id"),
  },
  (table) => [
    uniqueIndex("uq_api_client_tokens_prefix").on(table.tokenPrefix),
    uniqueIndex("uq_api_client_tokens_hash").on(table.tokenHash),
    index("idx_api_client_tokens_client_status").on(table.clientId, table.status),
    check("chk_api_client_tokens_status", sql`${table.status} IN ('active', 'revoked', 'rotated')`),
  ],
);

export type ApiClientTokenRow = typeof apiClientTokens.$inferSelect;
export type ApiClientTokenInsert = typeof apiClientTokens.$inferInsert;

/**
 * Audit trail for every mutating action on requests/clients/tokens.
 * `actorAdminId` is set for admin-initiated actions, `actorDeveloperAccountId`
 * for developer self-service actions — exactly one of the two is set (never
 * both, never neither) by every writer in `api-access-repository.ts`.
 */
export const apiAccessAuditEvents = pgTable(
  "api_access_audit_events",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").references(() => apiClients.id, { onDelete: "set null" }),
    requestId: text("request_id").references(() => apiAccessRequests.id, { onDelete: "set null" }),
    tokenId: text("token_id").references(() => apiClientTokens.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    actorAdminId: text("actor_admin_id").references(() => adminUsers.id, { onDelete: "set null" }),
    actorDeveloperAccountId: text("actor_developer_account_id").references(() => developerAccounts.id, {
      onDelete: "set null",
    }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    eventData: jsonb("event_data").notNull().default({}),
  },
  (table) => [index("idx_api_access_audit_events_client_occurred").on(table.clientId, table.occurredAt)],
);

export type ApiAccessAuditEventRow = typeof apiAccessAuditEvents.$inferSelect;
export type ApiAccessAuditEventInsert = typeof apiAccessAuditEvents.$inferInsert;
