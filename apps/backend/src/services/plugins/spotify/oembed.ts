/**
 * Spotify oEmbed wrapper. Keyless endpoint used as a fallback when
 * `/v1/tracks/{id}` returns 404 because the track is not available in
 * the API region. oEmbed still answers with title (and embedded artist
 * names in the iframe HTML), enough to feed cross-service resolve via
 * Title+Artist search.
 */

import { fetchWithTimeout } from "../../../lib/infra/fetch.js";
import { log } from "../../../lib/infra/logger.js";

const OEMBED_URL = "https://open.spotify.com/oembed";
const TIMEOUT_MS = 5000;

export interface SpotifyOEmbed {
  title: string;
  artists: string[];
}

interface SpotifyOEmbedResponse {
  title?: string;
  html?: string;
}

export async function fetchSpotifyOEmbed(spotifyUrl: string): Promise<SpotifyOEmbed | null> {
  try {
    const res = await fetchWithTimeout(`${OEMBED_URL}?url=${encodeURIComponent(spotifyUrl)}`, {}, TIMEOUT_MS);
    if (!res.ok) {
      log.debug("Spotify", "oEmbed HTTP error", res.status, spotifyUrl);
      return null;
    }
    const data = (await res.json()) as SpotifyOEmbedResponse;
    if (!data.title) return null;

    const { title, artists } = parseOEmbedTitle(data.title);
    return { title, artists };
  } catch (err) {
    log.debug("Spotify", "oEmbed threw", err);
    return null;
  }
}

// oEmbed `title` is typically "Track Name - song by Artist1, Artist2".
// The trailing "- song by …" part carries the artist names. Album/playlist
// titles use different shapes; this parser focuses on the track shape.
export function parseOEmbedTitle(raw: string): { title: string; artists: string[] } {
  const match = raw.match(/^(.*?)\s+[-–]\s+song by\s+(.+)$/i);
  if (!match) return { title: raw.trim(), artists: [] };

  const title = match[1].trim();
  const artists = match[2]
    .split(/,\s*|\s+&\s+/)
    .map((a) => a.trim())
    .filter(Boolean);
  return { title, artists };
}
