import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

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
 * When an artist entity was last checked against an identity provider, and
 * what came of it. The identity enrichment picks its next entities by this
 * row, so an entity the provider does not know is not asked about on every run.
 */
export const artistIdentityChecks = pgTable(
  "artist_identity_checks",
  {
    artistEntityId: text("artist_entity_id")
      .notNull()
      .references(() => artistEntities.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    outcome: text("outcome").notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ name: "pk_artist_identity_checks", columns: [table.artistEntityId, table.provider] }),
    check("chk_artist_identity_checks_outcome", sql`${table.outcome} IN ('matched', 'no_match', 'conflict', 'failed')`),
    index("idx_artist_identity_checks_due").on(table.provider, table.checkedAt),
  ],
);
