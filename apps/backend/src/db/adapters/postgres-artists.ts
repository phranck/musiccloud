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
 *   - Share-page projection for the public artist endpoint.
 *
 * Re-exported from sibling modules, so importers keep using this one:
 *   - JSON cache (profile / top-tracks / events) and the cross-artist alias
 *     lookup over cached top tracks, in `postgres-artist-cache.ts`.
 *   - Identity-event timeline (birth / death / formed / disbanded) used by
 *     the "today in music" feature, group-membership lookups in either
 *     direction, and the entity lookup by provider identifier, in
 *     `postgres-artist-identity-reads.ts`.
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
import type { NormalizedArtist, TrackSource } from "../../services/types.js";
import type {
  ArtistInfoEntity,
  CachedArtistResult,
  ExternalIdRecord,
  PersistArtistData,
  SharePageArtistResult,
} from "../repository.js";
import {
  ARTIST_NAME_LATERAL_JOIN,
  ARTIST_NAME_SELECT,
  artistNamePreferenceOrder,
  dateToMs,
  ensureArtistEntityExists,
  ensureArtistEntityForName,
  ensureArtistEntityName,
  insertExternalIds,
  type ServiceLinkWrite,
  safeParseArray,
  upsertServiceLinks,
} from "./postgres-shared.js";
import { mintShortUrl } from "./short-url.js";

export {
  cleanupStaleCache,
  findArtistCache,
  findArtistInfoAliasByShortId,
  saveArtistCache,
} from "./postgres-artist-cache.js";
export {
  findArtistEntityIdByIdentifier,
  listArtistGroupMembers,
  listArtistIdentityEventsByDay,
  listArtistMemberships,
  rowToArtistGroupMembership,
  rowToArtistIdentityEvent,
} from "./postgres-artist-identity-reads.js";

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

interface ArtistInfoEntityRow {
  artist_entity_id: string;
  artist_name: string;
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

/**
 * Resolves one normalized artist entity to its preferred persisted display
 * name. The query deliberately starts at `artist_entities`, rather than
 * `artist_profiles`: track and album credits may refer to a valid entity
 * before a commercial artist profile was persisted for it.
 *
 * Its name ordering matches {@link ARTIST_NAME_LATERAL_JOIN}: locale-less
 * canonical names win, followed by any canonical name, credit names, and
 * other stored variants. An entity without a usable name is not a meaningful
 * upstream artist lookup and is therefore returned as `null`.
 *
 * @param pool - Postgres connection pool.
 * @param artistEntityId - Exact normalized entity identifier.
 * @returns The entity and its preferred name, or `null` when not usable.
 */
export async function findArtistInfoEntity(pool: Pool, artistEntityId: string): Promise<ArtistInfoEntity | null> {
  const result = await pool.query<ArtistInfoEntityRow>(
    `SELECT ae.id AS artist_entity_id, artist_name.name AS artist_name
     FROM artist_entities ae
     JOIN LATERAL (
       SELECT n.name
       FROM artist_entity_names n
       WHERE n.artist_entity_id = ae.id
       ORDER BY ${artistNamePreferenceOrder("n")}
       LIMIT 1
     ) artist_name ON TRUE
     WHERE ae.id = $1
     LIMIT 1`,
    [artistEntityId],
  );

  const row = result.rows[0];
  return row ? { artistEntityId: row.artist_entity_id, artistName: row.artist_name } : null;
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

    await upsertServiceLinks(client, "artist", artistEntityId, data.links, now);

    const shortId = existingShortId ?? (await mintShortUrl(client, "artist_short_urls", artistEntityId, now));

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
export async function addLinksToArtist(pool: Pool, artistId: string, links: ServiceLinkWrite[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureArtistEntityExists(client, artistId);
    await upsertServiceLinks(client, "artist", artistId, links, new Date());
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
