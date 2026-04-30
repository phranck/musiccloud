/**
 * Deezer artist top tracks fetcher. Returns ArtistTopTrack[] in the
 * shared API shape so artist-composition can splice them into the
 * canonical artist record without further mapping.
 */

import type { ArtistTopTrack } from "@musiccloud/shared";
import { fetchWithTimeout } from "../../../lib/infra/fetch.js";
import { log } from "../../../lib/infra/logger.js";

const API_BASE = "https://api.deezer.com";
const TIMEOUT_MS = 5000;

interface DeezerTopTrack {
  title: string;
  duration: number;
  link: string;
  album: { title: string; cover_medium: string };
  artist: { name: string };
  contributors?: { name: string }[];
}

interface DeezerTopTracksResponse {
  data?: DeezerTopTrack[];
}

export async function fetchDeezerArtistTopTracks(artistId: number | string, limit = 3): Promise<ArtistTopTrack[]> {
  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/artist/${encodeURIComponent(String(artistId))}/top?limit=${limit}`,
      {},
      TIMEOUT_MS,
    );
    if (!res.ok) {
      log.debug("Deezer", "top tracks HTTP error", res.status, artistId);
      return [];
    }
    const data = (await res.json()) as DeezerTopTracksResponse;
    return (data.data ?? []).map(
      (t): ArtistTopTrack => ({
        title: t.title,
        artists: t.contributors?.length ? t.contributors.map((c) => c.name) : [t.artist.name],
        albumName: t.album.title ?? null,
        artworkUrl: t.album.cover_medium ?? null,
        durationMs: t.duration ? t.duration * 1000 : null,
        deezerUrl: t.link,
        shortId: null,
      }),
    );
  } catch (err) {
    log.debug("Deezer", "top tracks threw", err);
    return [];
  }
}
