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
import { deezerGet } from "./deezer-response.js";

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

/**
 * Whether a Deezer hit is the track that was asked for.
 *
 * @param candidateTitle - The hit's title.
 * @param candidateArtist - The hit's artist.
 * @param wantedTitle - The title searched for.
 * @param wantedArtist - The artist searched for.
 * @returns `true` when each title and each artist contains the other.
 */
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

/**
 * Looks a Last.fm top track up on Deezer for its cover, album, duration and link.
 *
 * @param title - The track title.
 * @param artistName - The artist the track has to belong to.
 * @returns The first plausible match, or `null` when Deezer has none.
 * @throws {UpstreamUnavailableError} when Deezer did not answer.
 */
export async function searchDeezerTrackForArtist(
  title: string,
  artistName: string,
): Promise<DeezerTrackEnrichment | null> {
  const q = encodeURIComponent(`${title} ${artistName}`);
  const data = await deezerGet<DeezerSearchTrackResponse>(`/search/track?q=${q}&limit=${SEARCH_LIMIT}`, "track search");
  for (const c of data?.data ?? []) {
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
}
