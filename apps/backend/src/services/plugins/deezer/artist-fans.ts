/**
 * Fan count lookup for Deezer artists. Surrogate for Spotify
 * `artist.followers` after the Feb-2026 Web API removal.
 *
 * Kept as a standalone module so the artist-info pipeline can import
 * it without dragging the full Deezer adapter (which pulls in shared
 * resolver internals not needed here).
 */

import { deezerArtistPath, deezerGet } from "./deezer-response.js";

/**
 * The part of Deezer's `/artist/{id}` answer this module reads.
 *
 * @property id - Deezer's artist id.
 * @property nb_fan - How many Deezer users follow the artist, absent when Deezer sends no count.
 */
interface DeezerArtistResponse {
  id: number | string;
  nb_fan?: number;
}

/**
 * Reads an artist's Deezer fan count.
 *
 * @param artistId - The Deezer artist id.
 * @returns The fan count, or `null` when Deezer has no such artist or no count.
 * @throws {UpstreamUnavailableError} when Deezer did not answer.
 */
export async function fetchDeezerFanCount(artistId: string): Promise<number | null> {
  const data = await deezerGet<DeezerArtistResponse>(deezerArtistPath(artistId), "artist lookup");
  return typeof data?.nb_fan === "number" ? data.nb_fan : null;
}
