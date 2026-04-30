/**
 * Spotify composition source. Post-Feb-2026 the Web API only returns
 * image + genres on the artist object; popularity, followers, and the
 * top-tracks endpoint were removed. This source therefore contributes
 * only those two fields and lets the merge strategy fill the rest from
 * Deezer + Last.fm.
 *
 * Returns null when the Spotify token is not configured or the artist
 * search yields no result.
 */

import { fetchWithTimeout } from "../../../lib/infra/fetch.js";
import { log } from "../../../lib/infra/logger.js";
import { TokenManager } from "../../../lib/infra/token-manager.js";
import type { ArtistPartial } from "../types.js";

const SPOTIFY_BASE = "https://api.spotify.com/v1";
const TIMEOUT_MS = 5000;
const MAX_GENRES = 3;

const spotifyToken = new TokenManager({
  serviceName: "Spotify",
  tokenUrl: "https://accounts.spotify.com/api/token",
  clientIdEnv: "SPOTIFY_CLIENT_ID",
  clientSecretEnv: "SPOTIFY_CLIENT_SECRET",
});

interface SpotifyImage {
  url: string;
  width: number | null;
  height: number | null;
}

interface SpotifyArtist {
  id: string;
  genres: string[];
  images: SpotifyImage[];
}

interface SpotifyArtistSearch {
  artists?: { items?: SpotifyArtist[] };
}

export function pickSpotifyImage(images: SpotifyImage[]): string | null {
  if (!images.length) return null;
  const sorted = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return (sorted.find((img) => (img.width ?? 0) >= 100) ?? sorted[0])?.url ?? null;
}

export async function fetchSpotifyArtistPartial(name: string): Promise<ArtistPartial | null> {
  if (!spotifyToken.isConfigured()) return null;

  try {
    const token = await spotifyToken.getAccessToken();
    const res = await fetchWithTimeout(
      `${SPOTIFY_BASE}/search?q=${encodeURIComponent(name)}&type=artist&limit=1`,
      { headers: { Authorization: `Bearer ${token}` } },
      TIMEOUT_MS,
    );
    if (!res.ok) {
      log.debug("Spotify", "artist search HTTP error", res.status, name);
      return null;
    }
    const data = (await res.json()) as SpotifyArtistSearch;
    const artist = data.artists?.items?.[0];
    if (!artist) return null;

    return {
      __source: "spotify",
      imageUrl: pickSpotifyImage(artist.images),
      genres: artist.genres.slice(0, MAX_GENRES),
    };
  } catch (err) {
    log.debug("Spotify", "artist search threw", err);
    return null;
  }
}
