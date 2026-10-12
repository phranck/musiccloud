/**
 * Last.fm `artist.getTopTags` wrapper. Used as a genres fallback when
 * Spotify is unreachable or has no genres for the artist.
 *
 * Last.fm tags are user-generated, so the raw list contains noise like
 * "seen live", "spotify", year tags ("2010", "80s"), and country tags
 * that are not really genres. `isGenreTag` removes those before the caller
 * sees them.
 */

import { isGenreTag, lastFmApiKey, lastFmGet } from "./lastfm-response.js";

const MAX_TAGS = 3;

interface LastFmTopTagsResponse {
  toptags?: {
    tag?: Array<{ name: string; count?: number }>;
  };
}

/**
 * Reduces an artist's Last.fm tags to its first few genres.
 *
 * @param tags - The tags in Last.fm's order, most used first.
 * @returns Up to three genre tags, lowercased and trimmed.
 */
export function filterLastFmTags(tags: Array<{ name: string }>): string[] {
  const out: string[] = [];
  for (const tag of tags) {
    if (!isGenreTag(tag.name)) continue;
    out.push(tag.name.trim().toLowerCase());
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/**
 * Reads an artist's Last.fm tags, filtered down to genres.
 *
 * @param name - The artist name.
 * @returns Up to three genre tags, empty without an API key or for an unknown artist.
 * @throws {UpstreamUnavailableError} when Last.fm did not answer.
 */
export async function fetchLastFmTopTags(name: string): Promise<string[]> {
  if (!lastFmApiKey()) return [];

  const data = await lastFmGet<LastFmTopTagsResponse>("artist.getTopTags", { artist: name });
  return filterLastFmTags(data?.toptags?.tag ?? []);
}
