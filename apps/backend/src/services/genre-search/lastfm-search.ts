/**
 * @file Last.fm-backed genre search.
 *
 * Uses Last.fm's tag system for genre discovery. Last.fm has thousands of
 * community-curated tags (trance, bebop, shoegaze, krautrock, ...) far
 * beyond the ~22 top-level genres that Spotify/Apple/Deezer expose.
 *
 * ## Artwork strategy
 *
 *   - Albums: Last.fm includes real cover art directly in the response.
 *   - Tracks: Last.fm returns a placeholder. The track image cache fills it in.
 *   - Artists: Resolved via the shared `getArtistImages()`, which asks
 *     Deezer and then Spotify.
 *
 * All artwork URLs are permanently cached in Postgres (track_images,
 * album_images, artist_images) so repeat queries have zero extra HTTP cost.
 *
 * ## Sampling
 *
 * Last.fm tags are already ranked by popularity. We fetch a larger pool
 * (up to {@link MAX_POOL}) and apply the same sampling strategies as the
 * Deezer/Apple adapters: top-N for `hot`, stratified sample for `mixed`.
 */

import { log } from "../../lib/infra/logger.js";
import { extractPrimaryArtist } from "../artist-utils.js";
import { cacheTrackImage, getArtistImages, getTrackImages, trackImageKey } from "../image-cache.js";
import type { GenreSearchResult } from "../types.js";
import {
  cacheAlbumImageInBackground,
  fetchTopAlbums,
  fetchTopArtists,
  fetchTopTracks,
  logLastfmDeviation,
  mapAlbum,
  mapArtist,
  mapTrack,
} from "./lastfm-api.js";
import { dedupeBy, interleave } from "./list-utils.js";
import { MAX_PER_TYPE } from "./parser.js";
import { evenSpacedSample, stratifiedSample } from "./sampler.js";

/**
 * How many items per type are fetched from Last.fm before sampling. It equals
 * {@link MAX_PER_TYPE} because the pool has to hold every item a caller may
 * request.
 */
const MAX_POOL = MAX_PER_TYPE;
const HOT_SPREAD_FACTOR = 3;
const HOT_SPREAD_MIN = 30;

/** What a genre search asks for: the genres, the sampling mode and how many items of each type. */
export interface LastfmGenreSearchInput {
  genres: string[];
  vibe: "hot" | "mixed";
  tracks: number;
  albums: number;
  artists: number;
}

/**
 * Run a genre-search query against Last.fm's tag system.
 *
 * Fetches tracks, albums, and artists for each tag (genre) in parallel,
 * interleaves multi-genre results, dedupes, samples, and enriches with
 * artwork from the permanent image cache.
 *
 * @param input - The genres, the sampling mode and the item counts per type.
 * @returns The sampled tracks, albums and artists, with artwork where known.
 */
export async function lastfmSearchByGenre(input: LastfmGenreSearchInput): Promise<GenreSearchResult> {
  if (input.tracks === 0 && input.albums === 0 && input.artists === 0) {
    return { tracks: [], albums: [], artists: [] };
  }

  // Fetch raw data for all genres in parallel
  const perGenre = await Promise.all(
    input.genres.map(async (genre) => {
      const [rawTracks, rawAlbums, rawArtists] = await Promise.all([
        input.tracks > 0 ? fetchTopTracks(genre, MAX_POOL) : Promise.resolve([]),
        input.albums > 0 ? fetchTopAlbums(genre, MAX_POOL) : Promise.resolve([]),
        input.artists > 0 ? fetchTopArtists(genre, MAX_POOL) : Promise.resolve([]),
      ]);
      return {
        tracks: rawTracks.map(mapTrack),
        albums: rawAlbums.map(mapAlbum),
        artists: rawArtists.map(mapArtist),
      };
    }),
  );

  // Interleave + dedupe across genres
  const tracksPool = dedupeBy(interleave(perGenre.map((p) => p.tracks)), (t) =>
    extractPrimaryArtist(t.artists[0] || t.sourceId),
  );
  const albumsPool = dedupeBy(interleave(perGenre.map((p) => p.albums)), (a) => a.sourceId);
  const artistsPool = dedupeBy(interleave(perGenre.map((p) => p.artists)), (a) => a.sourceId);

  // Sample
  const spreadRange = Math.min(
    Math.max(HOT_SPREAD_MIN, HOT_SPREAD_FACTOR * Math.max(input.albums, input.artists)),
    MAX_POOL,
  );

  const finalizeTop = <T>(pool: T[], target: number): T[] => {
    if (target === 0) return [];
    return input.vibe === "mixed" ? stratifiedSample(pool, target) : pool.slice(0, target);
  };
  const finalizeSpread = <T>(pool: T[], target: number): T[] => {
    if (target === 0) return [];
    if (input.vibe === "mixed") return stratifiedSample(pool, target);
    return evenSpacedSample(pool.slice(0, spreadRange), target);
  };

  const finalTracks = finalizeTop(tracksPool, input.tracks);
  const finalAlbums = finalizeSpread(albumsPool, input.albums);
  const finalArtists = finalizeSpread(artistsPool, input.artists);

  // ─── Artwork enrichment (parallel) ─────────────────────────────────────

  const enrichOps: Promise<void>[] = [];

  // Tracks: DB cache first, Last.fm track.getInfo for misses
  if (finalTracks.length > 0) {
    enrichOps.push(
      (async () => {
        const trackKeys = finalTracks.map((t) => ({ artist: t.artists[0], title: t.title }));
        const imageMap = await getTrackImages(trackKeys);
        for (const t of finalTracks) {
          t.artworkUrl = imageMap.get(trackImageKey(t.artists[0], t.title)) ?? t.artworkUrl;
        }
      })(),
    );
  }

  // Artists: shared image cache, Deezer and then Spotify for misses
  if (finalArtists.length > 0) {
    enrichOps.push(
      (async () => {
        const imageMap = await getArtistImages(finalArtists.map((a) => a.name));
        for (const a of finalArtists) {
          a.imageUrl = imageMap.get(a.name) ?? a.imageUrl;
        }
      })(),
    );
  }

  await Promise.all(enrichOps);

  // Write-through for future cache hits. The response does not wait for it.
  for (const t of finalTracks) {
    if (t.artworkUrl) {
      cacheTrackImage(t.artists[0], t.title, t.artworkUrl, "lastfm").catch((error) =>
        logLastfmDeviation("track_artwork_cache_write", "response_without_cache_update", error),
      );
    }
  }
  for (const a of finalAlbums) {
    if (a.artworkUrl) {
      cacheAlbumImageInBackground(
        a.artists[0],
        a.title,
        a.artworkUrl,
        "album_artwork_cache_write",
        "response_without_cache_update",
      );
    }
  }

  log.debug(
    "LastfmGenreSearch",
    `Returned ${finalTracks.length}T/${finalAlbums.length}A/${finalArtists.length}Ar for [${input.genres.join(", ")}]`,
  );

  return {
    tracks: finalTracks,
    albums: finalAlbums,
    artists: finalArtists,
  };
}
