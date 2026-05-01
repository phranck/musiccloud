/**
 * Per-track Deezer search used to enrich Last.fm-sourced topTracks with
 * cover artwork, album name, duration, and a real Deezer URL. Invoked from
 * `services/artist-info.ts` after the partial-merge step picks up the
 * Last.fm fallback (which hard-codes `artworkUrl: null`).
 *
 * The plausibility filter is intentionally permissive (substring match in
 * either direction on both title and artist) so that "Alicia Keys" matches
 * "Alicia Keys & Maxwell" and "Twilight" matches "Twilight (Original Mix)",
 * but strict enough to reject Deezer's well-known fuzzy mismatches like
 * `Mareel` → `Michael Jackson`.
 */

import type { ArtistTopTrack } from "@musiccloud/shared";
import { fetchWithTimeout } from "../../../lib/infra/fetch.js";
import { log } from "../../../lib/infra/logger.js";

const API_BASE = "https://api.deezer.com";
const TIMEOUT_MS = 5000;
const SEARCH_LIMIT = 3;

interface DeezerSearchTrackHit {
  id: number;
  title: string;
  duration: number;
  link: string;
  album: { title?: string; cover_medium?: string; cover_big?: string };
  artist: { name: string };
}

interface DeezerSearchTrackResponse {
  data?: DeezerSearchTrackHit[];
}

export type DeezerTrackEnrichment = Pick<ArtistTopTrack, "artworkUrl" | "albumName" | "durationMs" | "deezerUrl">;

export function isPlausibleMatch(
  candidateTitle: string,
  candidateArtist: string,
  wantedTitle: string,
  wantedArtist: string,
): boolean {
  const ct = candidateTitle.toLowerCase().trim();
  const wt = wantedTitle.toLowerCase().trim();
  const ca = candidateArtist.toLowerCase().trim();
  const wa = wantedArtist.toLowerCase().trim();

  const titleMatches = ct.includes(wt) || wt.includes(ct);
  const artistMatches = ca.includes(wa) || wa.includes(ca);

  return titleMatches && artistMatches;
}

export async function searchDeezerTrackForArtist(
  title: string,
  artistName: string,
): Promise<DeezerTrackEnrichment | null> {
  try {
    const q = encodeURIComponent(`${title} ${artistName}`);
    const res = await fetchWithTimeout(`${API_BASE}/search/track?q=${q}&limit=${SEARCH_LIMIT}`, {}, TIMEOUT_MS);
    if (!res.ok) {
      log.debug("Deezer", "track search HTTP error", res.status, title, artistName);
      return null;
    }
    const data = (await res.json()) as DeezerSearchTrackResponse;
    const candidates = data.data ?? [];
    for (const c of candidates) {
      if (isPlausibleMatch(c.title, c.artist.name, title, artistName)) {
        return {
          artworkUrl: c.album.cover_medium ?? c.album.cover_big ?? null,
          albumName: c.album.title ?? null,
          durationMs: c.duration ? c.duration * 1000 : null,
          deezerUrl: c.link,
        };
      }
    }
    return null;
  } catch (err) {
    log.debug("Deezer", "track search threw", err);
    return null;
  }
}
