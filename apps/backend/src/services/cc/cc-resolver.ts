/**
 * CC resolve orchestration. Deliberately separate from the commercial
 * `services/resolver.ts` (SRP): a two-leg flow with no cross-service, no ISRC,
 * no confidence heuristics. Leg 1 turns a query into a hit list; leg 2 turns a
 * picked candidate into a full track.
 */

import type { ApiDisambiguationCandidate } from "@musiccloud/shared";
import { isStructuredSearchQuery, parseStructuredSearchQuery } from "../structured-search/index.js";
import {
  type CcTrackQuery,
  getCcAlbum,
  getCcAlbumTracks,
  getCcArtist,
  getCcArtistTopTracks,
  getCcTrack,
  searchCcTracks,
} from "./jamendo/client.js";
import type { CcAlbum, CcArtist, CcTrack } from "./jamendo/types.js";

/**
 * Candidate-id prefixes that mark a CC (Jamendo) candidate by entity kind. The
 * three are disjoint (`jamendo-album:`/`jamendo-artist:` never match the bare
 * `jamendo:` `startsWith`), so the resolver can tell them apart by prefix alone.
 */
const CC_CANDIDATE_PREFIX = "jamendo:";
const CC_ALBUM_CANDIDATE_PREFIX = "jamendo-album:";
const CC_ARTIST_CANDIDATE_PREFIX = "jamendo-artist:";

/** Maximum hit-list size returned to the client. */
const CC_CANDIDATE_LIMIT = 10;

/**
 * Builds the opaque candidate id the client sends back as `selectedCandidate`.
 *
 * @param jamendoId - Jamendo track id.
 * @returns `jamendo:<jamendoId>`.
 */
export function ccCandidateId(jamendoId: string): string {
  return `${CC_CANDIDATE_PREFIX}${jamendoId}`;
}

/**
 * Builds the `jamendo-album:<id>` candidate id a genre-search album hit carries,
 * so a click resolves straight to the CC album view.
 *
 * @param jamendoAlbumId - Jamendo album id.
 * @returns `jamendo-album:<jamendoAlbumId>`.
 */
export function ccAlbumCandidateId(jamendoAlbumId: string): string {
  return `${CC_ALBUM_CANDIDATE_PREFIX}${jamendoAlbumId}`;
}

/**
 * Builds the `jamendo-artist:<id>` candidate id a genre-search artist hit carries,
 * so a click resolves straight to the CC artist view.
 *
 * @param jamendoArtistId - Jamendo artist id.
 * @returns `jamendo-artist:<jamendoArtistId>`.
 */
export function ccArtistCandidateId(jamendoArtistId: string): string {
  return `${CC_ARTIST_CANDIDATE_PREFIX}${jamendoArtistId}`;
}

/**
 * Extracts the Jamendo id from a CC candidate id.
 *
 * @param candidateId - Candidate id from a prior disambiguation round.
 * @returns The Jamendo id, or null when the id is not a CC candidate.
 */
export function parseCcCandidateId(candidateId: string): string | null {
  return candidateId.startsWith(CC_CANDIDATE_PREFIX) ? candidateId.slice(CC_CANDIDATE_PREFIX.length) : null;
}

/**
 * Extracts the Jamendo album id from a `jamendo-album:<id>` candidate id.
 *
 * @param candidateId - Candidate id from a prior genre-search round.
 * @returns The Jamendo album id, or null when the id is not a CC album candidate.
 */
export function parseCcAlbumCandidateId(candidateId: string): string | null {
  return candidateId.startsWith(CC_ALBUM_CANDIDATE_PREFIX) ? candidateId.slice(CC_ALBUM_CANDIDATE_PREFIX.length) : null;
}

/**
 * Extracts the Jamendo artist id from a `jamendo-artist:<id>` candidate id.
 *
 * @param candidateId - Candidate id from a prior genre-search round.
 * @returns The Jamendo artist id, or null when the id is not a CC artist candidate.
 */
export function parseCcArtistCandidateId(candidateId: string): string | null {
  return candidateId.startsWith(CC_ARTIST_CANDIDATE_PREFIX)
    ? candidateId.slice(CC_ARTIST_CANDIDATE_PREFIX.length)
    : null;
}

/**
 * Maps a CC track to a disambiguation candidate row.
 *
 * @param track - A resolved CC track.
 * @returns The wire-format candidate.
 */
function toCcCandidate(track: CcTrack): ApiDisambiguationCandidate {
  return {
    id: ccCandidateId(track.jamendoId),
    title: track.title,
    artists: [track.artistName],
    albumName: track.albumName,
    artworkUrl: track.artworkUrl,
  };
}

/**
 * Leg 1: resolves a free-text or structured (`title:`/`artist:`/`album:`) query
 * to a CC hit list. Reuses `parseStructuredSearchQuery` (DRY) for the structured
 * case. Always returns a candidate list (possibly empty) — the CC path never
 * auto-resolves a single hit, the user always picks.
 *
 * @param query - Raw query string.
 * @returns The disambiguation candidate list.
 */
export async function resolveCcTextSearch(query: string): Promise<{ candidates: ApiDisambiguationCandidate[] }> {
  let jamendoQuery: CcTrackQuery;
  if (isStructuredSearchQuery(query)) {
    const parsed = parseStructuredSearchQuery(query);
    jamendoQuery = {
      name: parsed.search.title,
      artist_name: parsed.search.artist,
      album_name: parsed.search.album,
      limit: parsed.candidateLimit ?? CC_CANDIDATE_LIMIT,
    };
  } else {
    jamendoQuery = { search: query, limit: CC_CANDIDATE_LIMIT };
  }
  const tracks = await searchCcTracks(jamendoQuery);
  return { candidates: tracks.map(toCcCandidate) };
}

/**
 * Discriminated result of resolving a picked CC candidate. The `kind` mirrors
 * the candidate-id prefix; album/artist carry their live track list (not yet
 * persisted — the route persists the entity and the tracks resolve lazily on
 * click).
 */
export type CcResolvedCandidate =
  | { kind: "track"; track: CcTrack }
  | { kind: "album"; album: CcAlbum; tracks: CcTrack[] }
  | { kind: "artist"; artist: CcArtist; topTracks: CcTrack[] };

/**
 * Leg 2: resolves a picked CC candidate id to its full entity. Dispatches on the
 * candidate-id prefix (`jamendo-album:`/`jamendo-artist:`/`jamendo:`) and fetches
 * the entity plus, for album/artist, its track list from Jamendo (two throttled
 * calls each).
 *
 * @param candidateId - Candidate id from a prior disambiguation / genre-search round.
 * @returns The resolved entity, or null when Jamendo has no such entity.
 * @throws Error when the candidate id matches none of the CC prefixes.
 */
export async function resolveCcCandidate(candidateId: string): Promise<CcResolvedCandidate | null> {
  const albumId = parseCcAlbumCandidateId(candidateId);
  if (albumId) {
    const album = await getCcAlbum(albumId);
    if (!album) {
      return null;
    }
    const tracks = await getCcAlbumTracks(albumId);
    return { kind: "album", album, tracks };
  }

  const artistId = parseCcArtistCandidateId(candidateId);
  if (artistId) {
    const artist = await getCcArtist(artistId);
    if (!artist) {
      return null;
    }
    const topTracks = await getCcArtistTopTracks(artistId);
    return { kind: "artist", artist, topTracks };
  }

  const trackId = parseCcCandidateId(candidateId);
  if (trackId) {
    const track = await getCcTrack(trackId);
    return track ? { kind: "track", track } : null;
  }

  throw new Error(`Not a CC candidate id: ${candidateId}`);
}
