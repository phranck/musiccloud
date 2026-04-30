/**
 * Last.fm `artist.getInfo` wrapper. Returns the bio summary, listener
 * counts, and similar-artist names. HTML stripping for the bio summary
 * lives here so callers see clean text.
 */

import { fetchWithTimeout } from "../../../lib/infra/fetch.js";
import { log } from "../../../lib/infra/logger.js";

const API_BASE = "https://ws.audioscrobbler.com/2.0";
const TIMEOUT_MS = 5000;

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

export async function fetchLastFmArtistInfo(name: string): Promise<LastFmArtistInfoResult | null> {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/?method=artist.getInfo&artist=${encodeURIComponent(name)}&api_key=${encodeURIComponent(apiKey)}&format=json`,
      {},
      TIMEOUT_MS,
    );
    if (!res.ok) {
      log.debug("Last.fm", "artist.getInfo HTTP error", res.status, name);
      return null;
    }
    const data = (await res.json()) as LastFmArtistInfoResponse;
    const artist = data.artist;
    if (!artist) return null;

    return {
      bioSummary: extractBioSummary(artist.bio?.summary ?? null),
      scrobbles: artist.stats?.playcount ? parseInt(artist.stats.playcount, 10) : null,
      listeners: artist.stats?.listeners ? parseInt(artist.stats.listeners, 10) : null,
      similarArtists: (artist.similar?.artist ?? []).slice(0, 3).map((a) => a.name),
    };
  } catch (err) {
    log.debug("Last.fm", "artist.getInfo threw", err);
    return null;
  }
}

function extractBioSummary(raw: string | null): string | null {
  if (!raw) return null;
  const stripped = raw
    .replace(/<a[^>]*>.*?<\/a>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return stripped || null;
}
