/**
 * Fan count lookup for Deezer artists. Surrogate for Spotify
 * `artist.followers` after the Feb-2026 Web API removal.
 *
 * Kept as a standalone module so the artist-info pipeline can import
 * it without dragging the full Deezer adapter (which pulls in shared
 * resolver internals not needed here).
 */

import { fetchWithTimeout } from "../../../lib/infra/fetch";
import { log } from "../../../lib/infra/logger";

const API_BASE = "https://api.deezer.com";
const TIMEOUT_MS = 5000;

interface DeezerArtistResponse {
  id: number | string;
  nb_fan?: number;
  error?: { type: string; message: string; code: number };
}

export async function fetchDeezerFanCount(
  artistId: string,
): Promise<number | null> {
  try {
    const response = await fetchWithTimeout(
      `${API_BASE}/artist/${encodeURIComponent(artistId)}`,
      {},
      TIMEOUT_MS,
    );

    if (!response.ok) {
      log.debug("Deezer", "fan-count fetch HTTP error", response.status, artistId);
      return null;
    }

    const data = (await response.json()) as DeezerArtistResponse;

    if (data.error) {
      log.debug("Deezer", "fan-count fetch API error", data.error.message, artistId);
      return null;
    }

    return typeof data.nb_fan === "number" ? data.nb_fan : null;
  } catch (err) {
    log.debug("Deezer", "fan-count fetch threw", err);
    return null;
  }
}
