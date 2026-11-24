/**
 * Artist info JSON cache: the profile, top-tracks and events blobs stored in
 * `artist_cache`, keyed by either a legacy display name or an explicit
 * normalized artist entity, plus the cross-artist alias lookup over cached
 * top tracks and the TTL cleanup of stale rows.
 *
 * `postgres-artists.ts` re-exports every function here, so importers keep
 * using that module.
 */

import type { ArtistProfileProvider } from "@musiccloud/shared";
import type { Pool } from "pg";
import { CACHE_TTL_MS } from "../../lib/config.js";
import type { ArtistCacheData, ArtistCacheIdentity, ArtistCacheRow } from "../repository.js";
import { dateToMs, safeParseJson } from "./postgres-shared.js";

/** Raw `artist_cache` row as the cache SELECT returns it, before its JSON columns are parsed. */
interface ArtistCacheRowDb {
  artist_name: string;
  top_tracks: string | null;
  profile: string | null;
  profile_providers: string[] | null;
  events: string | null;
  tracks_updated_at: Date | null;
  profile_updated_at: Date | null;
  events_updated_at: Date | null;
}

/**
 * Returns the cached profile / top-tracks / events JSON blobs for a
 * given name or normalized entity, or null when nothing is cached.
 *
 * The three blobs and their per-field timestamps are partial: a row may
 * have only `profile` populated, only `top_tracks`, etc., depending on
 * which sub-cache last fetched the artist. The `*UpdatedAt` fields are
 * `0` when their corresponding blob has not been written yet.
 *
 * @param pool - Postgres connection pool.
 * @param identity - Cache identity. Entity identities use a namespace that is
 * disjoint from legacy name-keyed records.
 * @returns Parsed cache row, or null.
 */
export async function findArtistCache(pool: Pool, identity: ArtistCacheIdentity): Promise<ArtistCacheRow | null> {
  const result = await pool.query(
    `SELECT artist_name, profile, profile_providers, top_tracks, events,
            profile_updated_at, tracks_updated_at, events_updated_at
     FROM artist_cache WHERE id = $1`,
    [artistCacheId(identity)],
  );

  if (result.rows.length === 0) return null;
  const row = result.rows[0] as ArtistCacheRowDb;

  return {
    artistName: row.artist_name,
    profile: safeParseJson(row.profile, null),
    profileProviders: (row.profile_providers ?? []).filter(isArtistProfileProvider),
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
  const id = artistCacheId(data.identity);
  const hasProfile = Object.hasOwn(data, "profile");
  const hasTopTracks = Object.hasOwn(data, "topTracks");
  const hasEvents = Object.hasOwn(data, "events");
  const profileUpdatedAt = hasProfile ? new Date(data.profileUpdatedAt ?? now.getTime()) : null;
  const tracksUpdatedAt = hasTopTracks ? new Date(data.tracksUpdatedAt ?? now.getTime()) : null;
  const eventsUpdatedAt = hasEvents ? new Date(data.eventsUpdatedAt ?? now.getTime()) : null;

  await pool.query(
    `INSERT INTO artist_cache (
      id, artist_name, profile, profile_providers, top_tracks, events,
      profile_updated_at, tracks_updated_at, events_updated_at,
      created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (id) DO UPDATE SET
      artist_name = EXCLUDED.artist_name,
      profile = CASE WHEN $12 AND (artist_cache.profile_updated_at IS NULL OR artist_cache.profile_updated_at <= EXCLUDED.profile_updated_at) THEN EXCLUDED.profile ELSE artist_cache.profile END,
      profile_providers = CASE WHEN $12 AND (artist_cache.profile_updated_at IS NULL OR artist_cache.profile_updated_at <= EXCLUDED.profile_updated_at) THEN EXCLUDED.profile_providers ELSE artist_cache.profile_providers END,
      top_tracks = CASE WHEN $13 AND (artist_cache.tracks_updated_at IS NULL OR artist_cache.tracks_updated_at <= EXCLUDED.tracks_updated_at) THEN EXCLUDED.top_tracks ELSE artist_cache.top_tracks END,
      events = CASE WHEN $14 AND (artist_cache.events_updated_at IS NULL OR artist_cache.events_updated_at <= EXCLUDED.events_updated_at) THEN EXCLUDED.events ELSE artist_cache.events END,
      profile_updated_at = CASE WHEN $12 AND (artist_cache.profile_updated_at IS NULL OR artist_cache.profile_updated_at <= EXCLUDED.profile_updated_at) THEN EXCLUDED.profile_updated_at ELSE artist_cache.profile_updated_at END,
      tracks_updated_at = CASE WHEN $13 AND (artist_cache.tracks_updated_at IS NULL OR artist_cache.tracks_updated_at <= EXCLUDED.tracks_updated_at) THEN EXCLUDED.tracks_updated_at ELSE artist_cache.tracks_updated_at END,
      events_updated_at = CASE WHEN $14 AND (artist_cache.events_updated_at IS NULL OR artist_cache.events_updated_at <= EXCLUDED.events_updated_at) THEN EXCLUDED.events_updated_at ELSE artist_cache.events_updated_at END,
      updated_at = EXCLUDED.updated_at`,
    [
      id,
      data.artistName,
      hasProfile && data.profile ? JSON.stringify(data.profile) : null,
      hasProfile ? (data.profileProviders ?? []) : [],
      hasTopTracks && data.topTracks ? JSON.stringify(data.topTracks) : null,
      hasEvents && data.events ? JSON.stringify(data.events) : null,
      profileUpdatedAt,
      tracksUpdatedAt,
      eventsUpdatedAt,
      now,
      now,
      hasProfile,
      hasTopTracks,
      hasEvents,
    ],
  );
}

/**
 * Narrows a stored provider name to the providers an artist profile can come
 * from, so unknown values in `profile_providers` are dropped on read.
 *
 * @param value - One entry of the stored `profile_providers` array.
 * @returns `true` for `spotify`, `deezer` and `lastfm`, `false` otherwise.
 */
function isArtistProfileProvider(value: string): value is ArtistProfileProvider {
  return value === "spotify" || value === "deezer" || value === "lastfm";
}

/**
 * Maps a typed artist-info cache identity to its primary key.
 *
 * Legacy cache rows retain their historical `artist-${name}` key. Entity rows
 * use `artistEntity:` rather than another `artist-` prefix, making both
 * namespaces structurally disjoint even when a display name resembles an id.
 */
function artistCacheId(identity: ArtistCacheIdentity): string {
  return identity.kind === "entity" ? `artistEntity:${identity.artistEntityId}` : `artist-${identity.artistName}`;
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
