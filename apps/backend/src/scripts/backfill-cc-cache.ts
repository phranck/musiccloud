/**
 * One-off backfill for the CC share-page DB cache.
 *
 * Migration 0045 added the `cc_tracks` detail/position columns and the resolve
 * path now persists the full CC entity (track details, album tracklist, artist
 * top tracks) so the share page reads from the DB instead of refetching live
 * from Jamendo. Entities that were shared BEFORE this change are missing that
 * data: track shares have `music_info` NULL, album shares have no persisted
 * tracklist, artist shares have no persisted top tracks.
 *
 * This script re-fetches each AFFECTED, SHARED entity from Jamendo once and
 * re-persists it through the same repository the resolve route uses, filling the
 * cache. It is idempotent (dedup by `jamendo_id`, `COALESCE` preserves existing
 * data) and only touches shared entities that are actually missing data, so it
 * is safe to re-run and cheap to leave dormant.
 *
 * Run after the new backend is deployed (so the schema + persist logic are live):
 *
 *   cd apps/backend
 *   DATABASE_URL=<target> JAMENDO_CLIENT_ID=<id> pnpm backfill:cc
 *
 * Every Jamendo call funnels through the shared client throttle, so the run is
 * paced automatically.
 */
import * as pgModule from "pg";
import { getCcRepository } from "../db/index.js";
import { ccTrackToPersistData } from "../services/cc/cc-share-response.js";
import {
  getCcAlbum,
  getCcAlbumTracks,
  getCcArtist,
  getCcArtistTopTracks,
  getCcTrack,
} from "../services/cc/jamendo/client.js";

interface BackfillCounts {
  tracks: number;
  albums: number;
  artists: number;
  skipped: number;
  failures: number;
}

/**
 * Runs `fn`, retrying on Jamendo `429` (rate limit) with linear backoff. A large
 * backfill burst trips Jamendo's rate limit even through the client throttle, so
 * each entity fetch backs off and retries rather than failing outright.
 *
 * @param fn - The Jamendo fetch to run.
 * @param label - Log label for the entity being fetched.
 * @param maxAttempts - Total attempts before giving up (default 5).
 * @returns The resolved value of `fn`.
 * @throws The last error when all attempts fail or the error is not a 429.
 */
async function withRateLimitRetry<T>(fn: () => Promise<T>, label: string, maxAttempts = 5): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isRateLimited = error instanceof Error && error.message.includes("429");
      if (!isRateLimited || attempt === maxAttempts) throw error;
      const delayMs = 3000 * attempt;
      console.warn(`[backfill]   ${label} rate-limited, retrying in ${delayMs}ms (attempt ${attempt}/${maxAttempts - 1})`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

async function backfill(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  if (!process.env.JAMENDO_CLIENT_ID) throw new Error("JAMENDO_CLIENT_ID is required");

  const pool = new pgModule.Pool({ connectionString: databaseUrl });
  const repo = await getCcRepository();
  const counts: BackfillCounts = { tracks: 0, albums: 0, artists: 0, skipped: 0, failures: 0 };

  try {
    // 1. Track shares missing the detail columns (resolved before migration 0045).
    const trackRows = await pool.query<{ jamendo_id: string }>(
      `SELECT t.jamendo_id
         FROM cc_tracks t
         JOIN cc_short_urls su ON su.cc_track_id = t.id
        WHERE t.music_info IS NULL`,
    );
    console.log(`[backfill] track shares missing details: ${trackRows.rows.length}`);
    for (const { jamendo_id } of trackRows.rows) {
      try {
        const track = await withRateLimitRetry(() => getCcTrack(jamendo_id), `track ${jamendo_id}`);
        if (!track) {
          console.warn(`[backfill]   track ${jamendo_id} gone from Jamendo — skipped`);
          counts.skipped++;
          continue;
        }
        await repo.persistCcTrack(ccTrackToPersistData(track));
        counts.tracks++;
      } catch (error) {
        counts.failures++;
        console.error(`[backfill]   track ${jamendo_id} failed:`, error instanceof Error ? error.message : error);
      }
    }

    // 2. Re-fetch every album share's full tracklist. Unlike `artist_top_position`
    //    (synthetic — only the artist-resolve path sets it), `album_position` is
    //    Jamendo's per-track field, so a single-track backfill sets it on a
    //    shared album track too. It therefore can't distinguish a complete,
    //    album-resolved tracklist from a couple of incidental track rows, so
    //    there is no cheap "already complete" predicate. Album shares are few, so
    //    re-fetch them all (idempotent: dedup by jamendo_id, COALESCE preserves
    //    existing data, position is rewritten from the full release order).
    const albumRows = await pool.query<{ jamendo_id: string }>(
      `SELECT a.jamendo_id
         FROM cc_albums a
         JOIN cc_album_short_urls su ON su.cc_album_id = a.id`,
    );
    console.log(`[backfill] album shares to refresh: ${albumRows.rows.length}`);
    for (const { jamendo_id } of albumRows.rows) {
      try {
        const album = await withRateLimitRetry(() => getCcAlbum(jamendo_id), `album ${jamendo_id}`);
        if (!album) {
          console.warn(`[backfill]   album ${jamendo_id} gone from Jamendo — skipped`);
          counts.skipped++;
          continue;
        }
        const tracks = await withRateLimitRetry(
          () => getCcAlbumTracks(album.jamendoId),
          `album ${jamendo_id} tracks`,
        );
        await repo.persistCcAlbum({
          jamendoId: album.jamendoId,
          name: album.name,
          jamendoArtistId: album.jamendoArtistId,
          artistName: album.artistName,
          artworkUrl: album.artworkUrl,
          releaseDate: album.releaseDate,
          zipUrl: album.zipUrl,
          shareUrl: album.shareUrl,
          tracks: tracks.map((track, i) => ({ ...ccTrackToPersistData(track), albumPosition: i + 1 })),
        });
        counts.albums++;
      } catch (error) {
        counts.failures++;
        console.error(`[backfill]   album ${jamendo_id} failed:`, error instanceof Error ? error.message : error);
      }
    }

    // 3. Artist shares with no persisted top tracks.
    const artistRows = await pool.query<{ jamendo_id: string }>(
      `SELECT ar.jamendo_id
         FROM cc_artists ar
         JOIN cc_artist_short_urls su ON su.cc_artist_id = ar.id
        WHERE NOT EXISTS (
          SELECT 1 FROM cc_tracks t WHERE t.cc_artist_id = ar.id AND t.artist_top_position IS NOT NULL
        )`,
    );
    console.log(`[backfill] artist shares missing top tracks: ${artistRows.rows.length}`);
    for (const { jamendo_id } of artistRows.rows) {
      try {
        const artist = await withRateLimitRetry(() => getCcArtist(jamendo_id), `artist ${jamendo_id}`);
        if (!artist) {
          console.warn(`[backfill]   artist ${jamendo_id} gone from Jamendo — skipped`);
          counts.skipped++;
          continue;
        }
        const topTracks = await withRateLimitRetry(
          () => getCcArtistTopTracks(artist.jamendoId),
          `artist ${jamendo_id} top tracks`,
        );
        await repo.persistCcArtist({
          jamendoId: artist.jamendoId,
          name: artist.name,
          imageUrl: artist.imageUrl,
          website: artist.website,
          shareUrl: artist.shareUrl,
          topTracks: topTracks.map((track, i) => ({ ...ccTrackToPersistData(track), artistTopPosition: i })),
        });
        counts.artists++;
      } catch (error) {
        counts.failures++;
        console.error(`[backfill]   artist ${jamendo_id} failed:`, error instanceof Error ? error.message : error);
      }
    }
  } finally {
    await pool.end();
  }

  console.log(
    `[backfill] done — ${counts.tracks} tracks, ${counts.albums} albums, ${counts.artists} artists backfilled; ` +
      `${counts.skipped} skipped (gone from Jamendo), ${counts.failures} failures`,
  );
  if (counts.failures > 0) process.exitCode = 1;
}

backfill().catch((error) => {
  console.error("[backfill] fatal:", error);
  process.exit(1);
});
