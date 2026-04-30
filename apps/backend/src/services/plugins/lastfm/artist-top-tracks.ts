/**
 * Last.fm `artist.getTopTracks` wrapper. Used as a Top-Tracks fallback
 * when Deezer has no entry for the artist. Last.fm does not return
 * preview URLs or album-cover URLs, so the returned ArtistTopTrack[]
 * has artworkUrl = null and durationMs = null.
 */

import type { ArtistTopTrack } from "@musiccloud/shared";
import { fetchWithTimeout } from "../../../lib/infra/fetch.js";
import { log } from "../../../lib/infra/logger.js";

const API_BASE = "https://ws.audioscrobbler.com/2.0";
const TIMEOUT_MS = 5000;

interface LastFmTopTracksResponse {
  toptracks?: {
    track?: Array<{
      name: string;
      url: string;
      artist: { name: string };
    }>;
  };
}

export async function fetchLastFmTopTracks(name: string, limit = 3): Promise<ArtistTopTrack[]> {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/?method=artist.getTopTracks&artist=${encodeURIComponent(name)}&api_key=${encodeURIComponent(apiKey)}&format=json&limit=${limit}`,
      {},
      TIMEOUT_MS,
    );
    if (!res.ok) {
      log.debug("Last.fm", "artist.getTopTracks HTTP error", res.status, name);
      return [];
    }
    const data = (await res.json()) as LastFmTopTracksResponse;
    const tracks = data.toptracks?.track ?? [];
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
  } catch (err) {
    log.debug("Last.fm", "artist.getTopTracks threw", err);
    return [];
  }
}
