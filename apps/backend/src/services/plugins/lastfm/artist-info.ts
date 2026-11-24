/**
 * Last.fm `artist.getInfo` wrapper. Returns the bio summary, listener
 * counts, and similar-artist names. The bio arrives as HTML and leaves as
 * plain text through `extractBioSummary` in `bio.ts`.
 */

import { extractBioSummary } from "./bio.js";
import { lastFmApiKey, lastFmGet } from "./client.js";

export interface LastFmArtistInfoResult {
  bioSummary: string | null;
  scrobbles: number | null;
  listeners: number | null;
  similarArtists: string[];
}

interface LastFmArtistInfoResponse {
  artist?: {
    bio?: { summary?: string };
    stats?: { playcount?: string; listeners?: string };
    similar?: { artist?: { name: string }[] };
  };
}

/**
 * Reads an artist's Last.fm bio, listener counts and similar artists.
 *
 * @param name - The artist name.
 * @returns The info, or `null` when no API key is configured or Last.fm does
 *   not know the artist.
 * @throws {UpstreamUnavailableError} when Last.fm did not answer.
 */
export async function fetchLastFmArtistInfo(name: string): Promise<LastFmArtistInfoResult | null> {
  if (!lastFmApiKey()) return null;

  const data = await lastFmGet<LastFmArtistInfoResponse>("artist.getInfo", { artist: name });
  const artist = data?.artist;
  if (!artist) return null;

  return {
    bioSummary: extractBioSummary(artist.bio?.summary ?? null),
    scrobbles: artist.stats?.playcount ? parseInt(artist.stats.playcount, 10) : null,
    listeners: artist.stats?.listeners ? parseInt(artist.stats.listeners, 10) : null,
    similarArtists: (artist.similar?.artist ?? []).slice(0, 5).map((a) => a.name),
  };
}
