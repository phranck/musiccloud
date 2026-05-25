/**
 * Artist domain: resolve, persist and aggregate metadata for artists
 * plus their service-link fan-out, JSON cache, identity-event timeline
 * and group-membership graph.
 *
 * Scope:
 *   - Resolution by canonical URL or any known artist name.
 *   - Persistence with name / source-url dedup, artist-entity provisioning
 *     and short-URL assignment.
 *   - External-id ingestion (migration `0019`) against the canonical
 *     `artist_entities.id`.
 *   - JSON cache (profile / top-tracks / events) keyed by display name,
 *     plus cross-artist alias resolution from cached top-tracks.
 *   - Identity-event timeline (birth / death / formed / disbanded) used
 *     by the "today in music" feature.
 *   - Group-membership lookups in either direction (group ↔ members).
 *   - Share-page projection for the public artist endpoint.
 *
 * Excludes:
 *   - Admin CRUD on artists and artist-entities (see
 *     `postgres-admin-catalog.ts`).
 *   - Track / album resolution and persistence (see `postgres-tracks.ts`,
 *     `postgres-albums.ts`).
 *   - Generic artist-entity persistence helpers consumed cross-domain by
 *     tracks + albums (see `postgres-shared.ts`).
 */

import type { Pool } from "pg";
import { CACHE_TTL_MS } from "../../lib/config.js";
import { generateShortId } from "../../lib/short-id.js";
import type { NormalizedArtist, TrackSource } from "../../services/types.js";
import type {
  ArtistCacheData,
  ArtistCacheRow,
  ArtistGroupMembershipRecord,
  ArtistIdentityEventRecord,
  ArtistIdentityEventType,
  CachedArtistResult,
  ExternalIdRecord,
  PersistArtistData,
  SharePageArtistResult,
} from "../repository.js";
import {
  ARTIST_NAME_LATERAL_JOIN,
  ARTIST_NAME_SELECT,
  dateToMs,
  ensureArtistEntityExists,
  ensureArtistEntityForName,
  ensureArtistEntityName,
  insertExternalIds,
  msToDate,
  safeParseArray,
  safeParseJson,
} from "./postgres-shared.js";

// ============================================================================
// ROW TYPES
// ============================================================================

/**
 * Raw shape returned by every artist-profile-bearing SELECT in this
 * module (without a service-link join).
 *
 * Exported so that admin-catalog list queries can extend it with their
 * own link-count / short-id additions.
 */
export interface ArtistRow {
  id: string;
  artist_entity_id: string;
  name: string;
  image_url: string | null;
  genres: string | null;
  source_service: string | null;
  source_url: string | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Artist row extended with a single `artist_service_links` row's columns,
 * used by queries that fan out artist-x-links and aggregate in code via
 * {@link buildCachedArtistResult}.
 */
export interface ArtistWithLinkRow extends ArtistRow {
  link_url: string | null;
  service: string | null;
  confidence: number | null;
  match_method: string | null;
  short_id: string | null;
}

interface ArtistCacheRowDb {
  artist_name: string;
  top_tracks: string | null;
  profile: string | null;
  events: string | null;
  tracks_updated_at: Date | null;
  profile_updated_at: Date | null;
  events_updated_at: Date | null;
}

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
  end_date: string | null;
  end_date_precision: ArtistGroupMembershipRecord["endDatePrecision"];
  end_year: number | null;
  is_current: boolean | null;
  source_provider: string | null;
  source_url: string | null;
  confidence: number | null;
}

// ============================================================================
// RESOLUTION
// ============================================================================

/**
 * Resolves an artist by its canonical source URL.
 *
 * Joins `artist_service_links` and `artist_short_urls` for the profile
 * whose `artist_profiles.source_url` matches. Returns null when no
 * profile matches.
 *
 * @param pool - Postgres connection pool.
 * @param url - Source URL recorded against the artist profile.
 * @returns The cached artist result with aggregated links, or null.
 */
export async function findArtistByUrl(pool: Pool, url: string): Promise<CachedArtistResult | null> {
  const result = await pool.query(
    `SELECT
      ar.artist_entity_id AS id, ar.artist_entity_id, ${ARTIST_NAME_SELECT}, ar.image_url, ar.genres, ar.source_service, ar.source_url,
      asl.url as link_url, asl.service, asl.confidence, asl.match_method,
      asu.id as short_id, ar.created_at, ar.updated_at
    FROM artist_profiles ar
    ${ARTIST_NAME_LATERAL_JOIN}
    LEFT JOIN artist_service_links asl ON ar.artist_entity_id = asl.artist_entity_id
    LEFT JOIN artist_short_urls asu ON ar.artist_entity_id = asu.artist_entity_id
    WHERE ar.source_url = $1
    ORDER BY asl.created_at ASC`,
    [url],
  );

  if (result.rows.length === 0) return null;
  return buildCachedArtistResult(result.rows as ArtistWithLinkRow[]);
}

/**
 * Resolves an artist by any of its known names (canonical, credit,
 * locale-specific) via the `artist_entity_names` aggregation table.
 *
 * Match is case-insensitive. The lateral join in {@link ARTIST_NAME_SELECT}
 * picks the best display name for the profile separately.
 *
 * @param pool - Postgres connection pool.
 * @param name - Artist name to resolve.
 * @returns The cached artist result, or null when no profile matches.
 */
export async function findArtistByName(pool: Pool, name: string): Promise<CachedArtistResult | null> {
  const result = await pool.query(
    `SELECT
      ar.artist_entity_id AS id, ar.artist_entity_id, ${ARTIST_NAME_SELECT}, ar.image_url, ar.genres, ar.source_service, ar.source_url,
      asl.url as link_url, asl.service, asl.confidence, asl.match_method,
      asu.id as short_id, ar.created_at, ar.updated_at
    FROM artist_profiles ar
    ${ARTIST_NAME_LATERAL_JOIN}
    LEFT JOIN artist_service_links asl ON ar.artist_entity_id = asl.artist_entity_id
    LEFT JOIN artist_short_urls asu ON ar.artist_entity_id = asu.artist_entity_id
    WHERE EXISTS (
      SELECT 1
      FROM artist_entity_names n
      WHERE n.artist_entity_id = ar.artist_entity_id AND LOWER(n.name) = LOWER($1)
    )
    ORDER BY asl.created_at ASC`,
    [name],
  );

  if (result.rows.length === 0) return null;
  return buildCachedArtistResult(result.rows as ArtistWithLinkRow[]);
}

// ============================================================================
// SHARE-PAGE LOADING
// ============================================================================

/**
 * Loads the full share-page projection for an artist addressed by its
 * short-id, with a minimal `(url, service)` link list.
 *
 * @param pool - Postgres connection pool.
 * @param shortId - Public short-id from `artist_short_urls`.
 * @returns The share-page projection, or null when no profile matches.
 */
export async function loadArtistByShortId(pool: Pool, shortId: string): Promise<SharePageArtistResult | null> {
  const result = await pool.query(
    `SELECT
      ar.artist_entity_id AS id, ar.artist_entity_id, ${ARTIST_NAME_SELECT}, ar.image_url, ar.genres, ar.source_service, ar.source_url,
      asl.url as link_url, asl.service,
      asu.id as short_id
    FROM artist_profiles ar
    ${ARTIST_NAME_LATERAL_JOIN}
    JOIN artist_short_urls asu ON ar.artist_entity_id = asu.artist_entity_id
    LEFT JOIN artist_service_links asl ON ar.artist_entity_id = asl.artist_entity_id
    WHERE asu.id = $1`,
    [shortId],
  );

  if (result.rows.length === 0) return null;

  const firstRow = result.rows[0] as ArtistWithLinkRow;

  return {
    artist: {
      name: firstRow.name,
      imageUrl: firstRow.image_url,
      genres: safeParseArray(firstRow.genres ?? "[]"),
    },
    links: (result.rows as ArtistWithLinkRow[])
      .filter((r) => r.link_url && r.service)
      .map((r) => ({
        service: r.service as string,
        url: r.link_url as string,
      })),
    shortId,
  };
}

// ============================================================================
// PERSISTENCE
// ============================================================================

/**
 * Transactional upsert of an artist profile, its canonical entity and
 * its service links.
 *
 * Dedup logic: looks up an existing profile first by `source_url` (when
 * set), then by any matching name in `artist_entity_names`. When either
 * lookup hits, the existing profile row is updated in place (preserving
 * its entity-id and short-id); otherwise a fresh `artist_entities` row
 * is provisioned via {@link ensureArtistEntityForName}, the credited
 * name is registered via {@link ensureArtistEntityName} and a new
 * short-id is assigned.
 *
 * Runs the whole sequence on a single client inside a `BEGIN` /
 * `COMMIT` block; any error rolls the transaction back.
 *
 * @param pool - Postgres connection pool.
 * @param data - Source-artist payload plus link list.
 * @returns The resolved `artistId` (artist-entity-id) and `shortId`.
 * @throws Query errors propagate after rollback.
 */
export async function persistArtistWithLinks(
  pool: Pool,
  data: PersistArtistData,
): Promise<{
  artistId: string;
  shortId: string;
}> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const now = new Date();

    let existingShortId: string | null = null;
    let existingArtistEntityId: string | null = null;

    if (data.sourceArtist.sourceUrl) {
      const found = await client.query<{ short_id: string | null; artist_entity_id: string }>(
        `SELECT ar.artist_entity_id, asu.id as short_id FROM artist_profiles ar
         LEFT JOIN artist_short_urls asu ON ar.artist_entity_id = asu.artist_entity_id
         WHERE ar.source_url = $1 LIMIT 1`,
        [data.sourceArtist.sourceUrl],
      );
      if (found.rows.length > 0) {
        existingShortId = found.rows[0].short_id;
        existingArtistEntityId = found.rows[0].artist_entity_id;
      }
    }

    if (!existingArtistEntityId) {
      const found = await client.query<{ short_id: string | null; artist_entity_id: string }>(
        `SELECT ar.artist_entity_id, asu.id as short_id FROM artist_profiles ar
         LEFT JOIN artist_short_urls asu ON ar.artist_entity_id = asu.artist_entity_id
         WHERE EXISTS (
           SELECT 1
           FROM artist_entity_names n
           WHERE n.artist_entity_id = ar.artist_entity_id AND LOWER(n.name) = LOWER($1)
         )
         LIMIT 1`,
        [data.sourceArtist.name],
      );
      if (found.rows.length > 0) {
        existingShortId = found.rows[0].short_id;
        existingArtistEntityId = found.rows[0].artist_entity_id;
      }
    }

    const shortId = existingShortId ?? generateShortId();
    const artistEntityId =
      existingArtistEntityId ?? (await ensureArtistEntityForName(client, data.sourceArtist.name, now));
    await ensureArtistEntityName(client, artistEntityId, data.sourceArtist.name, now);

    await client.query(
      `INSERT INTO artist_profiles (
        artist_entity_id, image_url, genres, source_service, source_url,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $6)
      ON CONFLICT (artist_entity_id) DO UPDATE SET
        image_url = EXCLUDED.image_url,
        genres = EXCLUDED.genres,
        source_service = COALESCE(EXCLUDED.source_service, artist_profiles.source_service),
        source_url = COALESCE(EXCLUDED.source_url, artist_profiles.source_url),
        updated_at = EXCLUDED.updated_at`,
      [
        artistEntityId,
        data.sourceArtist.imageUrl ?? null,
        data.sourceArtist.genres ? JSON.stringify(data.sourceArtist.genres) : null,
        data.sourceArtist.sourceService ?? null,
        data.sourceArtist.sourceUrl ?? null,
        now,
      ],
    );

    for (const link of data.links) {
      await client.query(
        `INSERT INTO artist_service_links (
          id, artist_entity_id, service, external_id, url, confidence, match_method, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (artist_entity_id, service) DO UPDATE SET
          external_id = EXCLUDED.external_id,
          url = EXCLUDED.url,
          confidence = EXCLUDED.confidence`,
        [
          `${artistEntityId}-${link.service}`,
          artistEntityId,
          link.service,
          link.externalId ?? null,
          link.url,
          link.confidence,
          link.matchMethod,
          now,
        ],
      );
    }

    if (!existingShortId) {
      await client.query(
        `INSERT INTO artist_short_urls (id, artist_entity_id, created_at) VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [shortId, artistEntityId, now],
      );
    }

    await client.query("COMMIT");
    return { artistId: artistEntityId, shortId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Adds (or updates) service links for an existing artist, transactional.
 *
 * The artist-entity row is provisioned first via
 * {@link ensureArtistEntityExists} so that callers can attach links to a
 * never-resolved entity (e.g., an admin-authored entity). Each link is
 * upserted on `(artist_entity_id, service)`; existing rows are patched,
 * never duplicated.
 *
 * @param pool - Postgres connection pool.
 * @param artistId - Artist-entity id that receives the links.
 * @param links - Service-link records to upsert.
 * @throws Query errors propagate after rollback.
 */
export async function addLinksToArtist(
  pool: Pool,
  artistId: string,
  links: Array<{ service: string; url: string; confidence: number; matchMethod: string; externalId?: string }>,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const now = new Date();
    await ensureArtistEntityExists(client, artistId);

    for (const link of links) {
      await client.query(
        `INSERT INTO artist_service_links (
          id, artist_entity_id, service, external_id, url, confidence, match_method, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (artist_entity_id, service) DO UPDATE SET
          external_id = EXCLUDED.external_id,
          url = EXCLUDED.url,
          confidence = EXCLUDED.confidence`,
        [
          `${artistId}-${link.service}`,
          artistId,
          link.service,
          link.externalId ?? null,
          link.url,
          link.confidence,
          link.matchMethod,
          now,
        ],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ============================================================================
// EXTERNAL-ID INGESTION (migration 0019)
// ============================================================================

/**
 * Records external-id observations against an artist-entity. No-op on
 * empty input.
 *
 * The artist-entity row is provisioned first via
 * {@link ensureArtistEntityExists} so that callers can ingest identifiers
 * for entities discovered before any profile row exists.
 *
 * @param pool - Postgres connection pool.
 * @param artistId - Artist-entity id that receives the observations.
 * @param records - External-id records to upsert.
 */
export async function addArtistExternalIds(pool: Pool, artistId: string, records: ExternalIdRecord[]): Promise<void> {
  if (records.length === 0) return;
  const client = await pool.connect();
  try {
    await ensureArtistEntityExists(client, artistId);
    await insertExternalIds(pool, "artist_external_ids", "artist_entity_id", artistId, records);
  } finally {
    client.release();
  }
}

// ============================================================================
// JSON CACHE
// ============================================================================

/**
 * Returns the cached profile / top-tracks / events JSON blobs for a
 * given artist name, or null when nothing is cached.
 *
 * The three blobs and their per-field timestamps are partial: a row may
 * have only `profile` populated, only `top_tracks`, etc., depending on
 * which sub-cache last fetched the artist. The `*UpdatedAt` fields are
 * `0` when their corresponding blob has not been written yet.
 *
 * @param pool - Postgres connection pool.
 * @param artistName - Cache key (display name).
 * @returns Parsed cache row, or null.
 */
export async function findArtistCache(pool: Pool, artistName: string): Promise<ArtistCacheRow | null> {
  const result = await pool.query(
    `SELECT artist_name, profile, top_tracks, events,
            profile_updated_at, tracks_updated_at, events_updated_at
     FROM artist_cache WHERE id = $1`,
    [`artist-${artistName}`],
  );

  if (result.rows.length === 0) return null;
  const row = result.rows[0] as ArtistCacheRowDb;

  return {
    artistName: row.artist_name,
    profile: safeParseJson(row.profile, null),
    topTracks: safeParseJson(row.top_tracks, []),
    events: safeParseJson(row.events, []),
    profileUpdatedAt: row.profile_updated_at ? dateToMs(row.profile_updated_at) : 0,
    tracksUpdatedAt: row.tracks_updated_at ? dateToMs(row.tracks_updated_at) : 0,
    eventsUpdatedAt: row.events_updated_at ? dateToMs(row.events_updated_at) : 0,
  };
}

/**
 * Cross-artist alias resolver used by the share-page info widget.
 *
 * Walks every track / album link reachable from the given `shortId` and
 * searches `artist_cache.top_tracks` for any cached artist whose top
 * tracks ILIKE one of those link URLs. Used to surface "this track also
 * appears in <other artist>'s discography" hints when the requested
 * artist is not the credited one.
 *
 * Excludes the requested artist itself and prefers names that contain
 * the requested name as a substring (most likely re-issues / aliases).
 *
 * @param pool - Postgres connection pool.
 * @param shortId - Track or album short-id used to seed the link set.
 * @param artistName - Currently-requested artist (lowercased, excluded
 *   from the result).
 * @returns A candidate alias name, or null when no alternate match is found.
 */
export async function findArtistInfoAliasByShortId(
  pool: Pool,
  shortId: string,
  artistName: string,
): Promise<string | null> {
  const requestedName = artistName.trim().toLowerCase();
  if (!shortId || !requestedName) return null;

  const result = await pool.query(
    `WITH target_links AS (
       SELECT sl.url
       FROM short_urls su
       JOIN service_links sl ON sl.track_id = su.track_id
       WHERE su.id = $1 AND sl.url IS NOT NULL
       UNION
       SELECT asl.url
       FROM album_short_urls asu
       JOIN album_service_links asl ON asl.album_id = asu.album_id
       WHERE asu.id = $1 AND asl.url IS NOT NULL
     ),
     matches AS (
       SELECT DISTINCT ac.artist_name
       FROM artist_cache ac
       JOIN target_links tl ON ac.top_tracks ILIKE '%' || tl.url || '%'
       WHERE ac.artist_name <> $2
     )
     SELECT artist_name
     FROM matches
     ORDER BY
       CASE WHEN artist_name LIKE '%' || $2 || '%' THEN 0 ELSE 1 END,
       length(artist_name) DESC
     LIMIT 1`,
    [shortId, requestedName],
  );

  const alias = result.rows[0]?.artist_name;
  return typeof alias === "string" && alias.trim() ? alias : null;
}

/**
 * Upserts an artist-cache row, persisting only the sub-blobs the caller
 * explicitly provided.
 *
 * Distinguishes "field omitted" from "field set to null" via
 * `Object.hasOwn`: only blobs whose key is present on `data` are
 * written, so partial updates do not clobber sibling blobs that were
 * cached by a previous call.
 *
 * @param pool - Postgres connection pool.
 * @param data - Partial cache payload.
 */
export async function saveArtistCache(pool: Pool, data: ArtistCacheData): Promise<void> {
  const now = new Date();
  const id = `artist-${data.artistName}`;
  const hasProfile = Object.hasOwn(data, "profile");
  const hasTopTracks = Object.hasOwn(data, "topTracks");
  const hasEvents = Object.hasOwn(data, "events");

  await pool.query(
    `INSERT INTO artist_cache (
      id, artist_name, profile, top_tracks, events,
      profile_updated_at, tracks_updated_at, events_updated_at,
      created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (id) DO UPDATE SET
      artist_name = EXCLUDED.artist_name,
      profile = CASE WHEN $11 THEN EXCLUDED.profile ELSE artist_cache.profile END,
      top_tracks = CASE WHEN $12 THEN EXCLUDED.top_tracks ELSE artist_cache.top_tracks END,
      events = CASE WHEN $13 THEN EXCLUDED.events ELSE artist_cache.events END,
      profile_updated_at = CASE WHEN $11 THEN EXCLUDED.profile_updated_at ELSE artist_cache.profile_updated_at END,
      tracks_updated_at = CASE WHEN $12 THEN EXCLUDED.tracks_updated_at ELSE artist_cache.tracks_updated_at END,
      events_updated_at = CASE WHEN $13 THEN EXCLUDED.events_updated_at ELSE artist_cache.events_updated_at END,
      updated_at = EXCLUDED.updated_at`,
    [
      id,
      data.artistName,
      hasProfile && data.profile ? JSON.stringify(data.profile) : null,
      hasTopTracks && data.topTracks ? JSON.stringify(data.topTracks) : null,
      hasEvents && data.events ? JSON.stringify(data.events) : null,
      data.profileUpdatedAt ? msToDate(data.profileUpdatedAt) : null,
      data.tracksUpdatedAt ? msToDate(data.tracksUpdatedAt) : null,
      data.eventsUpdatedAt ? msToDate(data.eventsUpdatedAt) : null,
      now,
      now,
      hasProfile,
      hasTopTracks,
      hasEvents,
    ],
  );
}

/**
 * Drops every artist-cache row older than `CACHE_TTL_MS`.
 *
 * Used by the adapter's recurring cleanup interval and from the admin
 * "clear artist cache" tool.
 *
 * @param pool - Postgres connection pool.
 * @returns Number of rows deleted.
 */
export async function cleanupStaleCache(pool: Pool): Promise<number> {
  const cutoff = new Date(Date.now() - CACHE_TTL_MS);

  const result = await pool.query(
    `DELETE FROM artist_cache
     WHERE updated_at < $1
     RETURNING id`,
    [cutoff],
  );

  return result.rowCount ?? 0;
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
       COALESCE(entity_name.name, '[unnamed artist]') AS display_name,
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
       agm.end_date::text AS end_date,
       agm.end_date_precision,
       agm.end_year,
       agm.is_current,
       src.provider AS source_provider,
       src.source_url,
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
       src.source_url
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
// RESULT BUILDERS
// ============================================================================

/**
 * Aggregates the rows of an artist-x-link join into a single cached
 * artist result, deduplicating links by service (last write wins).
 *
 * Returns null when the input is empty.
 *
 * @param rows - Artist-x-links rows from an artist resolution query.
 * @returns The cached artist result, or null.
 */
export function buildCachedArtistResult(rows: ArtistWithLinkRow[]): CachedArtistResult | null {
  if (rows.length === 0) return null;

  const firstRow = rows[0];
  const artist: NormalizedArtist = {
    sourceService: (firstRow.source_service as TrackSource) ?? "cached",
    sourceId: firstRow.id,
    name: firstRow.name,
    imageUrl: firstRow.image_url ?? undefined,
    genres: safeParseArray(firstRow.genres ?? "[]"),
    webUrl: firstRow.source_url ?? "",
  };

  const links = [
    ...new Map(
      rows
        .filter((r) => r.link_url && r.service)
        .map((r) => [
          r.service,
          {
            service: r.service!,
            url: r.link_url!,
            confidence: r.confidence ?? 0,
            matchMethod: r.match_method ?? "cache",
          },
        ]),
    ).values(),
  ];

  return {
    artistId: firstRow.id,
    artist,
    links,
    updatedAt: dateToMs(firstRow.updated_at),
  };
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
    endDate: row.end_date,
    endDatePrecision: row.end_date_precision,
    endYear: row.end_year,
    isCurrent: row.is_current,
    sourceProvider: row.source_provider,
    sourceUrl: row.source_url,
    confidence: row.confidence,
  };
}
