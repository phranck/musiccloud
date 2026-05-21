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
  (table) => [
    index("idx_short_urls_track_id").on(table.trackId),
    uniqueIndex("uq_short_urls_track_id").on(table.trackId),
  ],
);

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
  (table) => [
    index("idx_album_short_urls_album_id").on(table.albumId),
    uniqueIndex("uq_album_short_urls_album_id").on(table.albumId),
  ],
);

// ─── Normalized Artist Identity Tables ───────────────────────────────────────

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

export const artistSourcePayloads = pgTable("artist_source_payloads", {
  sourceId: text("source_id")
    .primaryKey()
    .references(() => artistSources.id, { onDelete: "cascade" }),
  rawPayload: jsonb("raw_payload").notNull(),
});

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
    check(
      "chk_artist_entity_names_name_type",
      sql`${table.nameType} IN ('canonical', 'alias', 'legal', 'stage', 'credit', 'sort')`,
    ),
  ],
);

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

export const places = pgTable("places", {
  id: text("id").primaryKey(),
  countryCode: text("country_code"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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
  ],
);

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
  contentCardStyle: text("content_card_style").notNull().default("recessed"),
  position: integer("position").notNull().default(0),
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
// holds the default-locale (en) source of truth + fallback. Missing rows
// trigger fallback at render time.
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
