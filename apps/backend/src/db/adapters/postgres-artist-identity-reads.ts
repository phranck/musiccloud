/**
 * Artist identity reads: the day-precision identity events (birth, death,
 * formed, disbanded) behind the "today in music" feature, band memberships
 * in either direction, and the lookup of an artist entity by a provider
 * identifier. The MusicBrainz enrichment writes live in
 * `postgres-artist-identity.ts`.
 *
 * `postgres-artists.ts` re-exports every function here, so importers keep
 * using that module.
 */

import type { Pool } from "pg";
import type { ArtistGroupMembershipRecord, ArtistIdentityEventRecord, ArtistIdentityEventType } from "../repository.js";
import { dateToMs, UNNAMED_ARTIST_NAME } from "./postgres-shared.js";

// ============================================================================
// ROW TYPES
// ============================================================================

/** Raw identity-event row as `listArtistIdentityEventsByDay` selects it. */
interface ArtistIdentityEventSqlRow {
  event_id: string;
  artist_entity_id: string;
  entity_type: ArtistIdentityEventRecord["entityType"];
  verification_status: ArtistIdentityEventRecord["verificationStatus"];
  display_name: string;
  event_type: ArtistIdentityEventRecord["eventType"];
  date_value: string | null;
  date_precision: ArtistIdentityEventRecord["datePrecision"];
  event_year: number | null;
  event_month: number | null;
  event_day: number | null;
  place_name: string | null;
  country_code: string | null;
  source_provider: string | null;
  source_url: string | null;
  confidence: number | null;
}

/** Raw group-membership row as `listArtistGroupMemberships` selects it, with its roles aggregated. */
interface ArtistGroupMembershipSqlRow {
  membership_id: string;
  group_artist_entity_id: string;
  group_name: string;
  member_artist_entity_id: string;
  member_name: string;
  member_name_credit: string | null;
  roles: string[] | null;
  begin_date: string | null;
  begin_date_precision: ArtistGroupMembershipRecord["beginDatePrecision"];
  begin_year: number | null;
  begin_month: number | null;
  begin_day: number | null;
  end_date: string | null;
  end_date_precision: ArtistGroupMembershipRecord["endDatePrecision"];
  end_year: number | null;
  end_month: number | null;
  end_day: number | null;
  is_current: boolean | null;
  source_provider: string | null;
  source_url: string | null;
  source_fetched_at: Date | null;
  confidence: number | null;
}

// ============================================================================
// IDENTITY EVENTS
// ============================================================================

/**
 * Returns the day-precision identity events (birth / death / formed /
 * disbanded) for a given month + day across all artist-entities.
 *
 * Filters:
 *   - `eventTypes` defaults to `["birth", "death"]` when omitted/empty.
 *   - `entity_type` must align with event type (people / personae for
 *     birth+death, groups for formed+disbanded).
 *   - `catalogOnly` restricts the result to entities credited on at
 *     least one track / album in the catalogue, transitively via group
 *     memberships.
 *
 * The locale parameter (`$5`) is used to pick the best display name and
 * place name via two lateral joins, falling back to canonical-name then
 * any-name when no locale-tagged variant exists.
 *
 * @param pool - Postgres connection pool.
 * @param params - Filter parameters; see fields above.
 * @returns Matching identity-event records, ordered by event type then
 *   display name.
 */
export async function listArtistIdentityEventsByDay(
  pool: Pool,
  params: {
    month: number;
    day: number;
    locale?: string;
    eventTypes?: ArtistIdentityEventType[];
    catalogOnly?: boolean;
  },
): Promise<ArtistIdentityEventRecord[]> {
  const eventTypes = params.eventTypes && params.eventTypes.length > 0 ? params.eventTypes : ["birth", "death"];
  const locale = params.locale ?? null;
  const catalogOnly = params.catalogOnly ?? false;

  const result = await pool.query<ArtistIdentityEventSqlRow>(
    `SELECT
       ev.id AS event_id,
       ae.id AS artist_entity_id,
       ae.entity_type,
       ae.verification_status,
       COALESCE(entity_name.name, '${UNNAMED_ARTIST_NAME}') AS display_name,
       ev.event_type,
       ev.date_value::text AS date_value,
       ev.date_precision,
       ev.event_year,
       ev.event_month,
       ev.event_day,
       place_name.name AS place_name,
       p.country_code,
       src.provider AS source_provider,
       src.source_url,
       ev.confidence
     FROM artist_entity_events ev
     JOIN artist_entities ae ON ae.id = ev.artist_entity_id
     LEFT JOIN LATERAL (
       SELECT n.name
       FROM artist_entity_names n
       WHERE n.artist_entity_id = ae.id
       ORDER BY
         CASE
           WHEN n.locale = $5 AND n.name_type = 'canonical' THEN 0
           WHEN n.locale IS NULL AND n.name_type = 'canonical' THEN 1
           WHEN n.name_type = 'canonical' THEN 2
           WHEN n.locale = $5 THEN 3
           WHEN n.locale IS NULL THEN 4
           ELSE 5
         END,
         n.created_at ASC
       LIMIT 1
     ) entity_name ON TRUE
     LEFT JOIN places p ON p.id = ev.place_id
     LEFT JOIN LATERAL (
       SELECT pn.name
       FROM place_names pn
       WHERE pn.place_id = p.id
       ORDER BY
         CASE
           WHEN pn.locale = $5 THEN 0
           WHEN pn.locale IS NULL THEN 1
           ELSE 2
         END,
         pn.created_at ASC
       LIMIT 1
     ) place_name ON TRUE
     LEFT JOIN artist_sources src ON src.id = ev.source_id
     WHERE ev.event_type = ANY($1::text[])
       AND ev.date_precision = 'day'
       AND ev.event_month = $2
       AND ev.event_day = $3
       AND (
         (ev.event_type IN ('birth', 'death') AND ae.entity_type IN ('person', 'persona'))
         OR (ev.event_type IN ('formed', 'disbanded') AND ae.entity_type = 'group')
       )
       AND (
         $4::boolean = false
         OR EXISTS (
           SELECT 1 FROM track_artist_credits tac WHERE tac.artist_entity_id = ae.id
         )
         OR EXISTS (
           SELECT 1 FROM album_artist_credits aac WHERE aac.artist_entity_id = ae.id
         )
         OR EXISTS (
           SELECT 1
           FROM artist_group_memberships agm
           WHERE agm.member_artist_entity_id = ae.id
             AND (
               EXISTS (
                 SELECT 1 FROM track_artist_credits gtac WHERE gtac.artist_entity_id = agm.group_artist_entity_id
               )
               OR EXISTS (
                 SELECT 1 FROM album_artist_credits gaac WHERE gaac.artist_entity_id = agm.group_artist_entity_id
               )
             )
         )
       )
     ORDER BY ev.event_type ASC, display_name ASC`,
    [eventTypes, params.month, params.day, catalogOnly, locale],
  );

  return result.rows.map(rowToArtistIdentityEvent);
}

// ============================================================================
// GROUP MEMBERSHIPS
// ============================================================================

/**
 * Lists every member of the given group artist-entity.
 *
 * @param pool - Postgres connection pool.
 * @param groupArtistEntityId - Artist-entity id of the group.
 * @param locale - Preferred locale for member / group display names.
 * @returns Membership records.
 */
export async function listArtistGroupMembers(
  pool: Pool,
  groupArtistEntityId: string,
  locale?: string,
): Promise<ArtistGroupMembershipRecord[]> {
  return listArtistGroupMemberships(pool, "group", groupArtistEntityId, locale);
}

/**
 * Lists every group that the given member artist-entity belongs to.
 *
 * @param pool - Postgres connection pool.
 * @param memberArtistEntityId - Artist-entity id of the member.
 * @param locale - Preferred locale for member / group display names.
 * @returns Membership records.
 */
export async function listArtistMemberships(
  pool: Pool,
  memberArtistEntityId: string,
  locale?: string,
): Promise<ArtistGroupMembershipRecord[]> {
  return listArtistGroupMemberships(pool, "member", memberArtistEntityId, locale);
}

/**
 * Resolves an artist-entity-id from a `(provider, external_id)` pair via
 * the `artist_entity_identifiers` catalogue.
 *
 * @param pool - Postgres connection pool.
 * @param provider - Provider key (e.g., `"musicbrainz"`, `"spotify"`).
 * @param externalId - Provider-side identifier.
 * @returns The artist-entity-id, or null when no record matches.
 */
export async function findArtistEntityIdByIdentifier(
  pool: Pool,
  provider: string,
  externalId: string,
): Promise<string | null> {
  const result = await pool.query<{ artist_entity_id: string }>(
    `SELECT artist_entity_id
     FROM artist_entity_identifiers
     WHERE provider = $1 AND external_id = $2
     LIMIT 1`,
    [provider, externalId],
  );
  return result.rows[0]?.artist_entity_id ?? null;
}

/**
 * Shared backend for {@link listArtistGroupMembers} and
 * {@link listArtistMemberships}: returns membership rows filtered by
 * either the group side or the member side of the relation.
 *
 * Orders current memberships first, then by begin-year ascending, then
 * by member / group display name. Roles are aggregated into a sorted
 * string array.
 *
 * @param pool - Postgres connection pool.
 * @param direction - `"group"` to filter by the group side,
 *   `"member"` to filter by the member side.
 * @param artistEntityId - Artist-entity id on the chosen side.
 * @param locale - Preferred locale for display names.
 */
async function listArtistGroupMemberships(
  pool: Pool,
  direction: "group" | "member",
  artistEntityId: string,
  locale?: string,
): Promise<ArtistGroupMembershipRecord[]> {
  const whereColumn = direction === "group" ? "agm.group_artist_entity_id" : "agm.member_artist_entity_id";
  const result = await pool.query<ArtistGroupMembershipSqlRow>(
    `SELECT
       agm.id AS membership_id,
       agm.group_artist_entity_id,
       COALESCE(group_name.name, '[unnamed group]') AS group_name,
       agm.member_artist_entity_id,
       COALESCE(member_name.name, agm.member_name_credit, '[unnamed member]') AS member_name,
       agm.member_name_credit,
       array_remove(array_agg(role.role ORDER BY role.role), NULL) AS roles,
       agm.begin_date::text AS begin_date,
       agm.begin_date_precision,
       agm.begin_year,
       agm.begin_month,
       agm.begin_day,
       agm.end_date::text AS end_date,
       agm.end_date_precision,
       agm.end_year,
       agm.end_month,
       agm.end_day,
       agm.is_current,
       src.provider AS source_provider,
       src.source_url,
       src.fetched_at AS source_fetched_at,
       agm.confidence
     FROM artist_group_memberships agm
     JOIN artist_entities group_entity ON group_entity.id = agm.group_artist_entity_id
     JOIN artist_entities member_entity ON member_entity.id = agm.member_artist_entity_id
     LEFT JOIN LATERAL (
       SELECT n.name
       FROM artist_entity_names n
       WHERE n.artist_entity_id = group_entity.id
       ORDER BY
         CASE
           WHEN n.locale = $2 AND n.name_type = 'canonical' THEN 0
           WHEN n.locale IS NULL AND n.name_type = 'canonical' THEN 1
           WHEN n.name_type = 'canonical' THEN 2
           WHEN n.locale = $2 THEN 3
           WHEN n.locale IS NULL THEN 4
           ELSE 5
         END,
         n.created_at ASC
       LIMIT 1
     ) group_name ON TRUE
     LEFT JOIN LATERAL (
       SELECT n.name
       FROM artist_entity_names n
       WHERE n.artist_entity_id = member_entity.id
       ORDER BY
         CASE
           WHEN n.locale = $2 AND n.name_type = 'canonical' THEN 0
           WHEN n.locale IS NULL AND n.name_type = 'canonical' THEN 1
           WHEN n.name_type = 'canonical' THEN 2
           WHEN n.locale = $2 THEN 3
           WHEN n.locale IS NULL THEN 4
           ELSE 5
         END,
         n.created_at ASC
       LIMIT 1
     ) member_name ON TRUE
     LEFT JOIN artist_group_membership_roles role ON role.membership_id = agm.id
     LEFT JOIN artist_sources src ON src.id = agm.source_id
     WHERE ${whereColumn} = $1
     GROUP BY
       agm.id,
       group_name.name,
       member_name.name,
       src.provider,
       src.source_url,
       src.fetched_at
     ORDER BY
       COALESCE(agm.is_current, false) DESC,
       agm.begin_year ASC NULLS LAST,
       member_name ASC,
       group_name ASC`,
    [artistEntityId, locale ?? null],
  );
  return result.rows.map(rowToArtistGroupMembership);
}

// ============================================================================
// ROW MAPPERS
// ============================================================================

/**
 * Maps a raw identity-event SQL row to the public
 * {@link ArtistIdentityEventRecord} shape.
 *
 * @param row - Raw row from {@link listArtistIdentityEventsByDay}.
 */
export function rowToArtistIdentityEvent(row: ArtistIdentityEventSqlRow): ArtistIdentityEventRecord {
  return {
    eventId: row.event_id,
    artistEntityId: row.artist_entity_id,
    entityType: row.entity_type,
    verificationStatus: row.verification_status,
    displayName: row.display_name,
    eventType: row.event_type,
    dateValue: row.date_value,
    datePrecision: row.date_precision,
    eventYear: row.event_year,
    eventMonth: row.event_month,
    eventDay: row.event_day,
    placeName: row.place_name,
    countryCode: row.country_code,
    sourceProvider: row.source_provider,
    sourceUrl: row.source_url,
    confidence: row.confidence,
  };
}

/**
 * Maps a raw group-membership SQL row to the public
 * {@link ArtistGroupMembershipRecord} shape, with a guaranteed roles
 * array (null becomes `[]`).
 *
 * @param row - Raw row from {@link listArtistGroupMemberships}.
 */
export function rowToArtistGroupMembership(row: ArtistGroupMembershipSqlRow): ArtistGroupMembershipRecord {
  return {
    membershipId: row.membership_id,
    groupArtistEntityId: row.group_artist_entity_id,
    groupName: row.group_name,
    memberArtistEntityId: row.member_artist_entity_id,
    memberName: row.member_name,
    memberNameCredit: row.member_name_credit,
    roles: row.roles ?? [],
    beginDate: row.begin_date,
    beginDatePrecision: row.begin_date_precision,
    beginYear: row.begin_year,
    beginMonth: row.begin_month,
    beginDay: row.begin_day,
    endDate: row.end_date,
    endDatePrecision: row.end_date_precision,
    endYear: row.end_year,
    endMonth: row.end_month,
    endDay: row.end_day,
    isCurrent: row.is_current,
    sourceProvider: row.source_provider,
    sourceUrl: row.source_url,
    sourceFetchedAt: row.source_fetched_at ? dateToMs(row.source_fetched_at) : null,
    confidence: row.confidence,
  };
}
