/**
 * CC resolve orchestration. Deliberately separate from the commercial
 * `services/resolver.ts` (SRP): a two-leg flow with no cross-service, no ISRC,
 * no confidence heuristics. Leg 1 turns a query into a hit list; leg 2 turns a
 * picked candidate into a full track.
 */

import { type ApiDisambiguationCandidate, type JamendoLink, ResourceKind } from "@musiccloud/shared";
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
 * `jamendo:` `startsWith`), so {@link parseCandidateId} tells them apart by
 * prefix alone.
 */
const CC_CANDIDATE_PREFIXES: Readonly<Record<ResourceKind, string>> = {
  [ResourceKind.Track]: "jamendo:",
  [ResourceKind.Album]: "jamendo-album:",
  [ResourceKind.Artist]: "jamendo-artist:",
};

/** Maximum hit-list size returned to the client. */
const CC_CANDIDATE_LIMIT = 10;

/**
 * A CC candidate id taken apart into the entity kind its prefix names and the
 * Jamendo id after the prefix.
 *
 * @property kind - The entity kind of the prefix in {@link CC_CANDIDATE_PREFIXES}.
 * @property jamendoId - Everything after the prefix, possibly empty.
 */
export interface ParsedCcCandidateId {
  kind: ResourceKind;
  jamendoId: string;
}

/**
 * Builds the opaque candidate id a CC result carries and the client sends back
 * as `selectedCandidate`.
 *
 * @param kind - The entity kind, which picks the prefix from {@link CC_CANDIDATE_PREFIXES}.
 * @param jamendoId - The Jamendo id of the track, album or artist.
 * @returns `jamendo:<id>`, `jamendo-album:<id>` or `jamendo-artist:<id>`.
 */
export function buildCandidateId(kind: ResourceKind, jamendoId: string): string {
  return `${CC_CANDIDATE_PREFIXES[kind]}${jamendoId}`;
}

/**
 * Takes a CC candidate id apart into its entity kind and Jamendo id.
 *
 * @param token - Candidate id from a prior disambiguation or genre-search round.
 * @returns The kind and the Jamendo id after the prefix, or null when the token
 *   starts with none of the CC prefixes. A bare prefix yields an empty id.
 */
export function parseCandidateId(token: string): ParsedCcCandidateId | null {
  for (const [kind, prefix] of Object.entries(CC_CANDIDATE_PREFIXES) as [ResourceKind, string][]) {
    if (token.startsWith(prefix)) {
      return { kind, jamendoId: token.slice(prefix.length) };
    }
  }
  return null;
}

/**
 * Reads the Jamendo id from a candidate id of one entity kind.
 *
 * @param token - Candidate id from a prior round.
 * @param kind - The entity kind the token has to carry.
 * @returns The Jamendo id, or null when the token is not a candidate of `kind`.
 */
function parseCandidateIdOfKind(token: string, kind: ResourceKind): string | null {
  const parsed = parseCandidateId(token);
  return parsed?.kind === kind ? parsed.jamendoId : null;
}

/**
 * Builds the opaque candidate id the client sends back as `selectedCandidate`.
 *
 * @param jamendoId - Jamendo track id.
 * @returns `jamendo:<jamendoId>`.
 */
export function ccCandidateId(jamendoId: string): string {
  return buildCandidateId(ResourceKind.Track, jamendoId);
}

/**
 * Builds the `jamendo-album:<id>` candidate id a genre-search album hit carries,
 * so a click resolves straight to the CC album view.
 *
 * @param jamendoAlbumId - Jamendo album id.
 * @returns `jamendo-album:<jamendoAlbumId>`.
 */
export function ccAlbumCandidateId(jamendoAlbumId: string): string {
  return buildCandidateId(ResourceKind.Album, jamendoAlbumId);
}

/**
 * Builds the `jamendo-artist:<id>` candidate id a genre-search artist hit carries,
 * so a click resolves straight to the CC artist view.
 *
 * @param jamendoArtistId - Jamendo artist id.
 * @returns `jamendo-artist:<jamendoArtistId>`.
 */
export function ccArtistCandidateId(jamendoArtistId: string): string {
  return buildCandidateId(ResourceKind.Artist, jamendoArtistId);
}

/**
 * Builds the candidate id for the entity a pasted Jamendo link points at, so the
 * link resolves through the same {@link resolveCcCandidate} path as a picked
 * disambiguation row.
 *
 * @param link - The entity parsed from the link by `parseJamendoLink`.
 * @returns `jamendo:<id>`, `jamendo-album:<id>` or `jamendo-artist:<id>`.
 */
export function ccCandidateIdForJamendoLink(link: JamendoLink): string {
  return buildCandidateId(link.kind, link.jamendoId);
}

/**
 * Extracts the Jamendo id from a CC track candidate id.
 *
 * @param candidateId - Candidate id from a prior disambiguation round.
 * @returns The Jamendo id, or null when the id is not a CC track candidate.
 */
export function parseCcCandidateId(candidateId: string): string | null {
  return parseCandidateIdOfKind(candidateId, ResourceKind.Track);
}

/**
 * Extracts the Jamendo album id from a `jamendo-album:<id>` candidate id.
 *
 * @param candidateId - Candidate id from a prior genre-search round.
 * @returns The Jamendo album id, or null when the id is not a CC album candidate.
 */
export function parseCcAlbumCandidateId(candidateId: string): string | null {
  return parseCandidateIdOfKind(candidateId, ResourceKind.Album);
}

/**
 * Extracts the Jamendo artist id from a `jamendo-artist:<id>` candidate id.
 *
 * @param candidateId - Candidate id from a prior genre-search round.
 * @returns The Jamendo artist id, or null when the id is not a CC artist candidate.
 */
export function parseCcArtistCandidateId(candidateId: string): string | null {
  return parseCandidateIdOfKind(candidateId, ResourceKind.Artist);
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
 * case. Always returns a candidate list (possibly empty), because the CC path
 * never auto-resolves a single hit and the user always picks.
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
 * the candidate-id prefix. Album and artist carry their live track list, which
 * is not persisted yet: the route persists the entity, and the tracks resolve
 * lazily on click.
 */
export type CcResolvedCandidate =
  | { kind: "track"; track: CcTrack }
  | { kind: "album"; album: CcAlbum; tracks: CcTrack[] }
  | { kind: "artist"; artist: CcArtist; topTracks: CcTrack[] };

/**
 * Leg 2: resolves a picked CC candidate id to its full entity. Dispatches on the
 * kind {@link parseCandidateId} reads from the prefix and fetches the entity
 * plus, for album/artist, its track list from Jamendo (two throttled calls
 * each).
 *
 * @param candidateId - Candidate id from a prior disambiguation / genre-search round.
 * @returns The resolved entity, or null when Jamendo has no such entity.
 * @throws Error when the candidate id matches none of the CC prefixes or
 *   carries an empty Jamendo id.
 */
export async function resolveCcCandidate(candidateId: string): Promise<CcResolvedCandidate | null> {
  const parsed = parseCandidateId(candidateId);
  if (!parsed?.jamendoId) {
    throw new Error(`Not a CC candidate id: ${candidateId}`);
  }
  const { kind, jamendoId } = parsed;

  switch (kind) {
    case ResourceKind.Album: {
      const album = await getCcAlbum(jamendoId);
      if (!album) {
        return null;
      }
      const tracks = await getCcAlbumTracks(jamendoId);
      return { kind: "album", album, tracks };
    }
    case ResourceKind.Artist: {
      const artist = await getCcArtist(jamendoId);
      if (!artist) {
        return null;
      }
      const topTracks = await getCcArtistTopTracks(jamendoId);
      return { kind: "artist", artist, topTracks };
    }
    default: {
      const track = await getCcTrack(jamendoId);
      return track ? { kind: "track", track } : null;
    }
  }
}
