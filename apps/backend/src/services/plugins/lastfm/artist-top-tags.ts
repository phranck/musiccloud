/**
 * Last.fm `artist.getTopTags` wrapper. Used as a genres fallback when
 * Spotify is unreachable or has no genres for the artist.
 *
 * Last.fm tags are user-generated, so the raw list contains noise like
 * "seen live", "spotify", year tags ("2010", "80s"), and country tags
 * that are not really genres. The filter here removes those before the
 * caller sees them.
 */

import { fetchWithTimeout } from "../../../lib/infra/fetch.js";
import { readLastFmJson } from "./lastfm-response.js";

const API_BASE = "https://ws.audioscrobbler.com/2.0";
const TIMEOUT_MS = 5000;
const MAX_TAGS = 3;

interface LastFmTopTagsResponse {
  toptags?: {
    tag?: Array<{ name: string; count?: number }>;
  };
}

const TAG_BLOCKLIST = new Set([
  "seen live",
  "spotify",
  "favorite",
  "favorites",
  "favourite",
  "favourites",
  "soundtrack",
  "all",
  "love",
  "loved",
  "best",
]);

const YEAR_TAG_RE = /^(?:19|20)\d{2}$/;
const DECADE_TAG_RE = /^\d{2}s$/i;

export function filterLastFmTags(tags: Array<{ name: string }>): string[] {
  const out: string[] = [];
  for (const tag of tags) {
    const norm = tag.name.trim().toLowerCase();
    if (!norm) continue;
    if (TAG_BLOCKLIST.has(norm)) continue;
    if (YEAR_TAG_RE.test(norm)) continue;
    if (DECADE_TAG_RE.test(norm)) continue;
    out.push(norm);
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
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) return [];

  const res = await fetchWithTimeout(
    `${API_BASE}/?method=artist.getTopTags&artist=${encodeURIComponent(name)}&api_key=${encodeURIComponent(apiKey)}&format=json`,
    {},
    TIMEOUT_MS,
  );
  const data = await readLastFmJson<LastFmTopTagsResponse>(res, "artist.getTopTags");
  return filterLastFmTags(data?.toptags?.tag ?? []);
}
