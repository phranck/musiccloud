/**
 * Shared wrapper around Deezer `search/artist`. Used by composition
 * sources (artist-image, artist-top-tracks) so each does not redo the
 * search round-trip.
 */

import { fetchWithTimeout } from "../../../lib/infra/fetch.js";
import { log } from "../../../lib/infra/logger.js";

const API_BASE = "https://api.deezer.com";
const TIMEOUT_MS = 5000;

export interface DeezerArtistSearchHit {
  id: number;
  name: string;
  picture_xl?: string;
  picture_big?: string;
  picture_medium?: string;
}

interface DeezerArtistSearchResponse {
  data?: DeezerArtistSearchHit[];
}

export async function searchDeezerArtist(name: string): Promise<DeezerArtistSearchHit | null> {
  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/search/artist?q=${encodeURIComponent(name)}&limit=1`,
      {},
      TIMEOUT_MS,
    );
    if (!res.ok) {
      log.debug("Deezer", "artist search HTTP error", res.status, name);
      return null;
    }
    const data = (await res.json()) as DeezerArtistSearchResponse;
    return data.data?.[0] ?? null;
  } catch (err) {
    log.debug("Deezer", "artist search threw", err);
    return null;
  }
}
