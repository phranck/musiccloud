/**
 * Last.fm `artist.getTopTracks` wrapper. Used as a Top-Tracks fallback
 * when Deezer has no entry for the artist. Last.fm does not return
 * preview URLs or album-cover URLs, so the returned ArtistTopTrack[]
 * has artworkUrl = null and durationMs = null.
 */

import type { ArtistTopTrack } from "@musiccloud/shared";
import { lastFmApiKey, lastFmGet } from "./lastfm-response.js";

interface LastFmTopTracksResponse {
  toptracks?: {
    track?: Array<{
      name: string;
      url: string;
      artist: { name: string };
    }>;
  };
}

/**
 * Reads an artist's most played tracks on Last.fm.
 *
 * @param name - The artist name.
 * @param limit - How many tracks to ask for.
 * @returns The tracks, empty without an API key or for an unknown artist.
 * @throws {UpstreamUnavailableError} when Last.fm did not answer.
 */
export async function fetchLastFmTopTracks(name: string, limit = 3): Promise<ArtistTopTrack[]> {
  if (!lastFmApiKey()) return [];

  const data = await lastFmGet<LastFmTopTracksResponse>("artist.getTopTracks", {
    artist: name,
    limit: String(limit),
  });
  const tracks = data?.toptracks?.track ?? [];
  return tracks.slice(0, limit).map(
    (t): ArtistTopTrack => ({
      title: t.name,
      artists: [t.artist.name],
      albumName: null,
      artworkUrl: null,
      durationMs: null,
      deezerUrl: t.url,
      shortId: null,
    }),
  );
}
