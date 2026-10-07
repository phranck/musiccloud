/**
 * Fan count lookup for Deezer artists. Surrogate for Spotify
 * `artist.followers` after the Feb-2026 Web API removal.
 *
 * Kept as a standalone module so the artist-info pipeline can import
 * it without dragging the full Deezer adapter (which pulls in shared
 * resolver internals not needed here).
 */

import { fetchWithTimeout } from "../../../lib/infra/fetch";
import { readDeezerJson } from "./deezer-response.js";

const API_BASE = "https://api.deezer.com";
const TIMEOUT_MS = 5000;

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
  const response = await fetchWithTimeout(`${API_BASE}/artist/${encodeURIComponent(artistId)}`, {}, TIMEOUT_MS);
  const data = await readDeezerJson<DeezerArtistResponse>(response, "artist lookup");
  return typeof data?.nb_fan === "number" ? data.nb_fan : null;
}
