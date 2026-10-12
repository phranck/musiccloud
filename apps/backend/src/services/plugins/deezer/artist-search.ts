/**
 * Shared wrapper around Deezer `search/artist`. Used by composition
 * sources (artist-image, artist-top-tracks) so each does not redo the
 * search round-trip.
 */

import { deezerGet } from "./deezer-response.js";

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
  const data = await deezerGet<DeezerArtistSearchResponse>(
    `/search/artist?q=${encodeURIComponent(name)}&limit=1`,
    "artist search",
  );
  return data?.data?.[0] ?? null;
}
