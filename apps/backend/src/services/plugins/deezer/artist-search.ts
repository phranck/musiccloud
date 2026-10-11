/**
 * Shared wrapper around Deezer `search/artist`. Used by composition
 * sources (artist-image, artist-top-tracks) so each does not redo the
 * search round-trip.
 */

import { fetchWithTimeout } from "../../../lib/infra/fetch.js";
import { readDeezerJson } from "./deezer-response.js";

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

/**
 * Finds the best Deezer artist match for a name.
 *
 * @param name - The artist name to search for.
 * @returns The first hit, or `null` when Deezer knows no such artist.
 * @throws {UpstreamUnavailableError} when Deezer did not answer, so a caller
 *   can tell an outage apart from an unknown artist.
 */
export async function searchDeezerArtist(name: string): Promise<DeezerArtistSearchHit | null> {
  const res = await fetchWithTimeout(`${API_BASE}/search/artist?q=${encodeURIComponent(name)}&limit=1`, {}, TIMEOUT_MS);
  const data = await readDeezerJson<DeezerArtistSearchResponse>(res, "artist search");
  return data?.data?.[0] ?? null;
}
