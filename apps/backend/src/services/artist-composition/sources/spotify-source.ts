/**
 * Spotify composition source. The Web API's artist search returns images
 * and no longer sends genres, popularity or followers, and the top-tracks
 * endpoint is gone. This source therefore contributes the picture and, where
 * Spotify still sends them, the genres. An empty genre list counts as missing
 * in the merge, so Last.fm supplies the genres and Deezer and Last.fm the rest.
 *
 * Returns null when the Spotify token is not configured or the artist
 * search yields no result, and throws when Spotify did not answer, so the
 * caller does not store an outage as an artist without genres.
 */

import { fetchWithTimeout } from "../../../lib/infra/fetch.js";
import { TokenManager } from "../../../lib/infra/token-manager.js";
import { UpstreamUnavailableError } from "../../../lib/infra/upstream-unavailable.js";
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

/** An artist object from Spotify's artist search, with the fields this source reads. */
interface SpotifyArtist {
  /** Spotify's artist ID. */
  id: string;
  /**
   * The artist's genres. Spotify's artist search no longer sends this field,
   * so it is read as optional and an absent list contributes no genres.
   */
  genres?: string[];
  /** The artist's pictures, in the sizes Spotify offers. */
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

  const token = await spotifyToken.getAccessToken();
  const res = await fetchWithTimeout(
    `${SPOTIFY_BASE}/search?q=${encodeURIComponent(name)}&type=artist&limit=1`,
    { headers: { Authorization: `Bearer ${token}` } },
    TIMEOUT_MS,
  );
  if (!res.ok) {
    throw new UpstreamUnavailableError("spotify", `artist search answered HTTP ${res.status}`);
  }
  const data = (await res.json()) as SpotifyArtistSearch;
  const artist = data.artists?.items?.[0];
  if (!artist) return null;

  return {
    __source: "spotify",
    imageUrl: pickSpotifyImage(artist.images),
    genres: artist.genres?.slice(0, MAX_GENRES) ?? [],
  };
}
