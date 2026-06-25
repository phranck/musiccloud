/**
 * Creative-Commons (Jamendo) persistence. Mirrors the commercial track
 * persistence shape but drastically slimmer: a single source (Jamendo), dedup
 * via the `jamendo_id` unique key, no service-links / external-ids / previews /
 * credits, and an eagerly-created canonical short URL per track.
 */

import type { Pool, PoolClient } from "pg";
import { generateShortId, generateTrackId } from "../../lib/short-id.js";
import type {
  CcAlbumShareRow,
  CcArtistShareRow,
  CcShortIdLookup,
  CcTrackShareRow,
  PersistCcAlbumData,
  PersistCcArtistData,
  PersistCcTrackData,
} from "../repository.js";

/**
 * Eagerly mints (or reuses) the canonical short code for a CC entity. Idempotent:
 * the `INSERT … ON CONFLICT (<fkColumn>) DO NOTHING` keeps any existing code, then
 * the code is read back so it never changes across re-resolves.
 *
 * `table` and `fkColumn` are trusted internal identifiers (never user input), so
 * interpolating them into the SQL is safe.
 *
 * @param client - Active transaction client.
 * @param table - Short-url table, e.g. `"cc_album_short_urls"`.
 * @param fkColumn - Entity FK column, e.g. `"cc_album_id"`.
 * @param entityId - Internal id of the owning entity.
 * @param now - Shared transaction timestamp.
 * @returns The stable short code.
 */
async function mintCcShortUrl(
  client: PoolClient,
  table: string,
  fkColumn: string,
  entityId: string,
  now: Date,
): Promise<string> {
  await client.query(
    `INSERT INTO ${table} (id, ${fkColumn}, created_at) VALUES ($1, $2, $3)
     ON CONFLICT (${fkColumn}) DO NOTHING`,
    [generateShortId(), entityId, now],
  );
  const result = await client.query(`SELECT id FROM ${table} WHERE ${fkColumn} = $1`, [entityId]);
  return result.rows[0].id as string;
}

/**
 * Upserts a CC artist by its Jamendo id and returns the internal id.
 * Idempotent: `ON CONFLICT (jamendo_id)` keeps the existing internal id.
 *
 * @param client - Active transaction client.
 * @param data - Artist fields.
 * @param now - Shared transaction timestamp.
 * @returns The internal `cc_artists.id`.
 */
async function upsertCcArtist(
  client: PoolClient,
  data: { jamendoId: string; name: string; imageUrl?: string; website?: string; shareUrl?: string },
  now: Date,
): Promise<string> {
  const result = await client.query(
    `INSERT INTO cc_artists (id, jamendo_id, name, image_url, website, share_url, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
     ON CONFLICT (jamendo_id) DO UPDATE SET
       name = EXCLUDED.name,
       image_url = EXCLUDED.image_url,
       website = EXCLUDED.website,
       share_url = EXCLUDED.share_url,
       updated_at = EXCLUDED.updated_at
     RETURNING id`,
    [
      generateTrackId(),
      data.jamendoId,
      data.name,
      data.imageUrl ?? null,
      data.website ?? null,
      data.shareUrl ?? null,
      now,
    ],
  );
  return result.rows[0].id as string;
}

/**
 * Upserts a CC album by its Jamendo id and returns the internal id.
 *
 * @param client - Active transaction client.
 * @param data - Album fields (with the resolved internal artist id).
 * @param now - Shared transaction timestamp.
 * @returns The internal `cc_albums.id`.
 */
async function upsertCcAlbum(
  client: PoolClient,
  data: {
    jamendoId: string;
    name: string;
    ccArtistId: string;
    artworkUrl?: string;
    releaseDate?: string;
    zipUrl?: string;
    shareUrl?: string;
  },
  now: Date,
): Promise<string> {
  const result = await client.query(
    `INSERT INTO cc_albums (id, jamendo_id, name, cc_artist_id, artwork_url, release_date, zip_url, share_url, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
     ON CONFLICT (jamendo_id) DO UPDATE SET
       name = EXCLUDED.name,
       cc_artist_id = EXCLUDED.cc_artist_id,
       artwork_url = EXCLUDED.artwork_url,
       release_date = EXCLUDED.release_date,
       zip_url = EXCLUDED.zip_url,
       share_url = EXCLUDED.share_url,
       updated_at = EXCLUDED.updated_at
     RETURNING id`,
    [
      generateTrackId(),
      data.jamendoId,
      data.name,
      data.ccArtistId,
      data.artworkUrl ?? null,
      data.releaseDate ?? null,
      data.zipUrl ?? null,
      data.shareUrl ?? null,
      now,
    ],
  );
  return result.rows[0].id as string;
}

/**
 * Upserts a single `cc_tracks` row (dedup by `jamendo_id`) and returns its
 * internal id. Shared by the single-track, album-tracklist and artist-top-tracks
 * persistence paths so the column list lives in exactly one place.
 *
 * The "enrichment" columns (`album_position`, `artist_top_position`,
 * `music_info`, `stats`, `pro_*`) update via `COALESCE(EXCLUDED, existing)`: a
 * partial re-persist (e.g. the same track appearing in an album tracklist
 * without the `include=musicinfo` payload) never erases richer data captured by
 * an earlier single-track resolve.
 *
 * @param client - Active transaction client.
 * @param data - Track payload (carries the position/enrichment fields).
 * @param ccArtistId - Resolved internal artist id for the FK.
 * @param ccAlbumId - Resolved internal album id, or null.
 * @param now - Shared transaction timestamp.
 * @returns The internal `cc_tracks.id` (stable across re-persists).
 */
async function upsertCcTrackRow(
  client: PoolClient,
  data: PersistCcTrackData,
  ccArtistId: string,
  ccAlbumId: string | null,
  now: Date,
): Promise<string> {
  const result = await client.query(
    `INSERT INTO cc_tracks (
      id, jamendo_id, title, artist_name, cc_artist_id, album_name, cc_album_id,
      album_position, artist_top_position, artwork_url, duration_ms, release_date,
      license_ccurl, stream_url, download_url, download_allowed, waveform, share_url,
      music_info, stats, pro_licensing, pro_url, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$23)
    ON CONFLICT (jamendo_id) DO UPDATE SET
      title = EXCLUDED.title,
      artist_name = EXCLUDED.artist_name,
      cc_artist_id = EXCLUDED.cc_artist_id,
      album_name = EXCLUDED.album_name,
      cc_album_id = COALESCE(EXCLUDED.cc_album_id, cc_tracks.cc_album_id),
      album_position = COALESCE(EXCLUDED.album_position, cc_tracks.album_position),
      artist_top_position = COALESCE(EXCLUDED.artist_top_position, cc_tracks.artist_top_position),
      artwork_url = EXCLUDED.artwork_url,
      duration_ms = EXCLUDED.duration_ms,
      release_date = EXCLUDED.release_date,
      license_ccurl = EXCLUDED.license_ccurl,
      stream_url = EXCLUDED.stream_url,
      download_url = EXCLUDED.download_url,
      download_allowed = EXCLUDED.download_allowed,
      waveform = EXCLUDED.waveform,
      share_url = EXCLUDED.share_url,
      music_info = COALESCE(EXCLUDED.music_info, cc_tracks.music_info),
      stats = COALESCE(EXCLUDED.stats, cc_tracks.stats),
      pro_licensing = COALESCE(EXCLUDED.pro_licensing, cc_tracks.pro_licensing),
      pro_url = COALESCE(EXCLUDED.pro_url, cc_tracks.pro_url),
      updated_at = EXCLUDED.updated_at
    RETURNING id`,
    [
      generateTrackId(),
      data.jamendoId,
      data.title,
      data.artistName,
      ccArtistId,
      data.albumName ?? null,
      ccAlbumId,
      data.albumPosition ?? null,
      data.artistTopPosition ?? null,
      data.artworkUrl ?? null,
      data.durationMs ?? null,
      data.releaseDate ?? null,
      data.licenseCcurl ?? null,
      data.streamUrl,
      data.downloadUrl ?? null,
      data.downloadAllowed ? 1 : 0,
      data.waveform ?? null,
      data.shareUrl ?? null,
      data.musicInfo ? JSON.stringify(data.musicInfo) : null,
      data.stats ? JSON.stringify(data.stats) : null,
      data.proLicensing == null ? null : data.proLicensing ? 1 : 0,
      data.proUrl ?? null,
      now,
    ],
  );
  return result.rows[0].id as string;
}

/**
 * Transactionally persists a CC track, its artist and optional album, and
 * eagerly mints a canonical short URL. Dedup is by `jamendo_id` on every
 * entity, so re-resolving the same track keeps all internal ids and the same
 * stable short code.
 *
 * @param pool - Postgres pool.
 * @param data - Flattened track + artist + album payload.
 * @returns The internal `cc_tracks.id` and the canonical short code.
 * @throws Query errors propagate after rollback.
 */
export async function persistCcTrack(
  pool: Pool,
  data: PersistCcTrackData,
): Promise<{ ccTrackId: string; shortId: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const now = new Date();

    const ccArtistId = await upsertCcArtist(
      client,
      {
        jamendoId: data.jamendoArtistId,
        name: data.artistName,
        imageUrl: data.artistImageUrl,
        website: data.artistWebsite,
        shareUrl: data.artistShareUrl,
      },
      now,
    );

    let ccAlbumId: string | null = null;
    if (data.jamendoAlbumId && data.albumName) {
      ccAlbumId = await upsertCcAlbum(
        client,
        {
          jamendoId: data.jamendoAlbumId,
          name: data.albumName,
          ccArtistId,
          artworkUrl: data.albumArtworkUrl,
          releaseDate: data.albumReleaseDate,
          zipUrl: data.albumZipUrl,
          shareUrl: data.albumShareUrl,
        },
        now,
      );
    }

    const ccTrackId = await upsertCcTrackRow(client, data, ccArtistId, ccAlbumId, now);

    const shortId = await mintCcShortUrl(client, "cc_short_urls", "cc_track_id", ccTrackId, now);

    await client.query("COMMIT");
    return { ccTrackId, shortId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Transactionally persists a resolved CC album: upserts its artist (for the FK),
 * the album, and the album's tracklist, then eagerly mints the album's canonical
 * short URL. Dedup is by `jamendo_id`, so re-resolving keeps the internal ids and
 * the stable short code. The tracklist is persisted (with `cc_album_id` +
 * `album_position`) so the share page renders it from the DB without a live call;
 * tracks share the album artist's id.
 *
 * @param pool - Postgres pool.
 * @param data - Album payload (artist inline for the FK upsert, plus the tracklist).
 * @returns The internal `cc_albums.id` and the canonical short code.
 * @throws Query errors propagate after rollback.
 */
export async function persistCcAlbum(
  pool: Pool,
  data: PersistCcAlbumData,
): Promise<{ ccAlbumId: string; shortId: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const now = new Date();

    const ccArtistId = await upsertCcArtist(client, { jamendoId: data.jamendoArtistId, name: data.artistName }, now);
    const ccAlbumId = await upsertCcAlbum(
      client,
      {
        jamendoId: data.jamendoId,
        name: data.name,
        ccArtistId,
        artworkUrl: data.artworkUrl,
        releaseDate: data.releaseDate,
        zipUrl: data.zipUrl,
        shareUrl: data.shareUrl,
      },
      now,
    );

    // Persist the tracklist so the share page reads it from the DB. Tracks share
    // the album artist's id and carry their 1-based `album_position`.
    for (const track of data.tracks) {
      await upsertCcTrackRow(client, track, ccArtistId, ccAlbumId, now);
    }

    const shortId = await mintCcShortUrl(client, "cc_album_short_urls", "cc_album_id", ccAlbumId, now);

    await client.query("COMMIT");
    return { ccAlbumId, shortId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Transactionally persists a resolved CC artist plus its top tracks and eagerly
 * mints its canonical short URL. Dedup is by `jamendo_id`. The top tracks are
 * persisted (with `artist_top_position` preserving the popularity order) so the
 * share page renders the column from the DB without a live call; `cc_album_id`
 * stays null (their albums are not resolved here).
 *
 * @param pool - Postgres pool.
 * @param data - Artist payload plus the top tracks.
 * @returns The internal `cc_artists.id` and the canonical short code.
 * @throws Query errors propagate after rollback.
 */
export async function persistCcArtist(
  pool: Pool,
  data: PersistCcArtistData,
): Promise<{ ccArtistId: string; shortId: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const now = new Date();

    const ccArtistId = await upsertCcArtist(
      client,
      {
        jamendoId: data.jamendoId,
        name: data.name,
        imageUrl: data.imageUrl,
        website: data.website,
        shareUrl: data.shareUrl,
      },
      now,
    );

    // Persist the top tracks so the share page reads the column from the DB.
    // They belong to this artist; their albums are not resolved → cc_album_id null.
    for (const track of data.topTracks) {
      await upsertCcTrackRow(client, track, ccArtistId, null, now);
    }

    const shortId = await mintCcShortUrl(client, "cc_artist_short_urls", "cc_artist_id", ccArtistId, now);

    await client.query("COMMIT");
    return { ccArtistId, shortId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Resolves a public CC short id to its entity kind and Jamendo id.
 *
 * Short ids live in a single namespace across the three CC short-url tables
 * (track, album, artist), so one `UNION ALL` joins each table to its entity and
 * returns the first hit. The share-page loader takes the Jamendo id from here
 * and refetches the full entity live, mirroring the resolve path.
 *
 * @param pool - Postgres pool.
 * @param shortId - Public short code from one of the `cc_*_short_urls` tables.
 * @returns The `{ kind, jamendoId }` lookup, or null when the id matches none.
 */
export async function findCcShortId(pool: Pool, shortId: string): Promise<CcShortIdLookup | null> {
  const result = await pool.query(
    `SELECT 'cc-track' AS kind, t.jamendo_id
       FROM cc_short_urls su JOIN cc_tracks t ON t.id = su.cc_track_id
       WHERE su.id = $1
     UNION ALL
     SELECT 'cc-album' AS kind, a.jamendo_id
       FROM cc_album_short_urls su JOIN cc_albums a ON a.id = su.cc_album_id
       WHERE su.id = $1
     UNION ALL
     SELECT 'cc-artist' AS kind, ar.jamendo_id
       FROM cc_artist_short_urls su JOIN cc_artists ar ON ar.id = su.cc_artist_id
       WHERE su.id = $1
     LIMIT 1`,
    [shortId],
  );
  if (result.rows.length === 0) return null;
  const r = result.rows[0];
  return { kind: r.kind as CcShortIdLookup["kind"], jamendoId: r.jamendo_id };
}

/**
 * Column projection for {@link CcTrackShareRow}, joined against `cc_artists ar`
 * for `jamendoArtistId`. Shared by the track / album-tracklist / artist-top-track
 * reads. `pg` returns `jsonb` already parsed and `text`/`integer` as JS
 * primitives, so the rows map straight onto `CcTrackShareRow`.
 */
const CC_TRACK_SHARE_COLUMNS = `
  t.jamendo_id        AS "jamendoId",
  t.title             AS "title",
  t.artist_name       AS "artistName",
  ar.jamendo_id       AS "jamendoArtistId",
  t.album_name        AS "albumName",
  t.album_position    AS "albumPosition",
  t.artwork_url       AS "artworkUrl",
  t.duration_ms       AS "durationMs",
  t.release_date      AS "releaseDate",
  t.license_ccurl     AS "licenseCcurl",
  t.stream_url        AS "streamUrl",
  t.download_url      AS "downloadUrl",
  t.download_allowed  AS "downloadAllowed",
  t.waveform          AS "waveform",
  t.share_url         AS "shareUrl",
  t.music_info        AS "musicInfo",
  t.stats             AS "stats",
  t.pro_licensing     AS "proLicensing",
  t.pro_url           AS "proUrl"`;

/**
 * Reads the full cc-track share projection for a short id (no Jamendo). Joins the
 * short-url → track → artist chain so `jamendoArtistId` is present for the wire
 * `ApiCcTrack` and the client-side artist column.
 *
 * @param pool - Postgres pool.
 * @param shortId - Public CC track short code.
 * @returns The track row, or null when the short id is not a cc-track.
 */
export async function loadCcTrackByShortId(pool: Pool, shortId: string): Promise<CcTrackShareRow | null> {
  const result = await pool.query(
    `SELECT ${CC_TRACK_SHARE_COLUMNS}
       FROM cc_short_urls su
       JOIN cc_tracks t ON t.id = su.cc_track_id
       JOIN cc_artists ar ON ar.id = t.cc_artist_id
      WHERE su.id = $1
      LIMIT 1`,
    [shortId],
  );
  return (result.rows[0] as CcTrackShareRow | undefined) ?? null;
}

/**
 * Reads a cc-album entity plus its persisted tracklist (release order) for a
 * short id (no Jamendo). Returns null when the short id is not a cc-album.
 *
 * @param pool - Postgres pool.
 * @param shortId - Public CC album short code.
 * @returns `{ album, tracks }`, or null when nothing matches.
 */
export async function loadCcAlbumByShortId(
  pool: Pool,
  shortId: string,
): Promise<{ album: CcAlbumShareRow; tracks: CcTrackShareRow[] } | null> {
  const albumResult = await pool.query(
    `SELECT
       a.id                AS "id",
       a.jamendo_id        AS "jamendoId",
       a.name              AS "name",
       ar.name             AS "artistName",
       ar.jamendo_id       AS "jamendoArtistId",
       a.artwork_url       AS "artworkUrl",
       a.release_date      AS "releaseDate",
       a.zip_url           AS "zipUrl",
       a.share_url         AS "shareUrl"
       FROM cc_album_short_urls su
       JOIN cc_albums a ON a.id = su.cc_album_id
       JOIN cc_artists ar ON ar.id = a.cc_artist_id
      WHERE su.id = $1
      LIMIT 1`,
    [shortId],
  );
  const albumRow = albumResult.rows[0] as (CcAlbumShareRow & { id: string }) | undefined;
  if (!albumRow) return null;
  const { id: ccAlbumId, ...album } = albumRow;

  const tracksResult = await pool.query(
    `SELECT ${CC_TRACK_SHARE_COLUMNS}
       FROM cc_tracks t
       JOIN cc_artists ar ON ar.id = t.cc_artist_id
      WHERE t.cc_album_id = $1
      ORDER BY t.album_position ASC NULLS LAST, t.created_at ASC`,
    [ccAlbumId],
  );
  return { album, tracks: tracksResult.rows as CcTrackShareRow[] };
}

/**
 * Reads a cc-artist entity plus its persisted top tracks (popularity order) for a
 * short id (no Jamendo). Returns null when the short id is not a cc-artist.
 *
 * @param pool - Postgres pool.
 * @param shortId - Public CC artist short code.
 * @returns `{ artist, topTracks }`, or null when nothing matches.
 */
export async function loadCcArtistByShortId(
  pool: Pool,
  shortId: string,
): Promise<{ artist: CcArtistShareRow; topTracks: CcTrackShareRow[] } | null> {
  const artistResult = await pool.query(
    `SELECT
       ar.id               AS "id",
       ar.jamendo_id       AS "jamendoId",
       ar.name             AS "name",
       ar.website          AS "website",
       ar.image_url        AS "imageUrl",
       ar.share_url        AS "shareUrl"
       FROM cc_artist_short_urls su
       JOIN cc_artists ar ON ar.id = su.cc_artist_id
      WHERE su.id = $1
      LIMIT 1`,
    [shortId],
  );
  const artistRow = artistResult.rows[0] as (CcArtistShareRow & { id: string }) | undefined;
  if (!artistRow) return null;
  const { id: ccArtistId, ...artist } = artistRow;

  const tracksResult = await pool.query(
    `SELECT ${CC_TRACK_SHARE_COLUMNS}
       FROM cc_tracks t
       JOIN cc_artists ar ON ar.id = t.cc_artist_id
      WHERE t.cc_artist_id = $1
      ORDER BY t.artist_top_position ASC NULLS LAST, t.created_at ASC`,
    [ccArtistId],
  );
  return { artist, topTracks: tracksResult.rows as CcTrackShareRow[] };
}

/**
 * Returns a random existing CC track short id, or `null` when none have been
 * shared yet. Powers the landing page's "live example" link in Creative-Commons
 * mode — mirrors the commercial `getRandomShortId` but draws from the CC track
 * short-url namespace so the example is a CC track (with its audio player).
 *
 * @param pool - The database pool.
 * @returns A random CC short id, or `null` when no CC track exists.
 */
export async function getRandomCcShortId(pool: Pool): Promise<string | null> {
  const result = await pool.query(
    `SELECT id FROM cc_short_urls
     OFFSET floor(random() * (SELECT COUNT(*) FROM cc_short_urls))::int
     LIMIT 1`,
  );
  if (result.rows.length === 0) return null;
  return result.rows[0].id;
}
