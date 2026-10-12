/**
 * @file How every adapter reads a search query and scores what its service
 * answered.
 *
 * The resolver marks a free-text search by sending the same string as both
 * `title` and `artist`. {@link isFreeTextSearch} reads that mark and
 * {@link searchText} turns a query into the text a service's search box is
 * asked with, so no adapter decodes the mark on its own.
 *
 * Tracks are scored by {@link scoreSearchCandidate} in two ways:
 *
 * 1. **Free-text query**: there is no separate artist to compare against, so
 *    `calculateConfidence` cannot be called meaningfully. The service's own
 *    relevance ranking is trusted and the confidence decays by position:
 *    position 0 gets 0.85, each later position loses 0.05, and the floor is
 *    0.4.
 *
 * 2. **Structured query**: `calculateConfidence` compares the normalised
 *    query and track. This is the usual cross-service resolve path, where the
 *    resolver already has a real source track and probes each adapter for it.
 *
 * Albums are scored by {@link scoreAlbumCandidate}, which passes every term
 * the query carries, the year and the track count included, so two editions
 * of one album score apart on every service.
 *
 * Keeping this in one place means the scoring is tuned uniformly: the
 * free-text constants (`0.85`, `0.05`, `0.4`) are empirical and keep a
 * free-text search above `MATCH_MIN_CONFIDENCE` for the first nine positions.
 * Changing any of them shifts every adapter at once, which is the intended
 * coupling.
 */
import { calculateAlbumConfidence, calculateConfidence } from "../../../lib/resolve/normalize";
import type { AlbumSearchQuery, NormalizedTrack, SearchQuery } from "../../types.js";

/**
 * Whether the resolver sent a free-text search rather than a title and an artist.
 *
 * @param query - The search query as passed to `searchTrack`.
 * @returns `true` when the title and the artist are the same string.
 */
export function isFreeTextSearch(query: Pick<SearchQuery, "title" | "artist">): boolean {
  return query.title === query.artist;
}

/**
 * The text a service's search box is asked with.
 *
 * @param query - The search query as passed to `searchTrack`.
 * @returns The text itself for a free-text search, and the artist followed by
 *   the title otherwise.
 */
export function searchText(query: Pick<SearchQuery, "title" | "artist">): string {
  return isFreeTextSearch(query) ? query.title : `${query.artist} ${query.title}`;
}

/**
 * Scores one search result candidate against the incoming query.
 *
 * @param query - the search query as passed to `searchTrack`
 * @param track - the normalised candidate produced by the adapter
 * @param index - zero-based position of `track` in the adapter's result list
 * @returns a confidence score in `[0, 1]`
 */
export function scoreSearchCandidate(query: SearchQuery, track: NormalizedTrack, index: number): number {
  if (isFreeTextSearch(query)) {
    // Free-text path: see the file header for the decay formula rationale.
    return Math.max(0.4, 0.85 - index * 0.05);
  }
  return calculateConfidence(
    {
      title: query.title,
      artists: query.artists?.length ? query.artists : [query.artist],
      durationMs: query.durationMs,
    },
    { title: track.title, artists: track.artists, durationMs: track.durationMs },
  );
}

/**
 * An album a service answered, with the fields an album score reads.
 *
 * @property releaseDate - A date or a year; only its first four characters count.
 * @property totalTracks - The number of tracks, when the service reports it.
 */
export interface AlbumCandidate {
  title: string;
  artists: string[];
  releaseDate?: string;
  totalTracks?: number;
}

/**
 * Scores one album candidate against an album search.
 *
 * Every term the query carries is passed: title, artist, year and track count.
 * A term the candidate does not report simply adds nothing.
 *
 * @param query - The album search as passed to `searchAlbum`.
 * @param album - The candidate produced by the adapter.
 * @returns A confidence score in `[0, 1]`.
 */
export function scoreAlbumCandidate(query: AlbumSearchQuery, album: AlbumCandidate): number {
  return calculateAlbumConfidence(
    { title: query.title, artists: [query.artist], releaseDate: query.year, totalTracks: query.totalTracks },
    { title: album.title, artists: album.artists, releaseDate: album.releaseDate, totalTracks: album.totalTracks },
  );
}
