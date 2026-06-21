/**
 * CC resolve orchestration. Deliberately separate from the commercial
 * `services/resolver.ts` (SRP): a two-leg flow with no cross-service, no ISRC,
 * no confidence heuristics. Leg 1 turns a query into a hit list; leg 2 turns a
 * picked candidate into a full track.
 */

import type { ApiDisambiguationCandidate } from "@musiccloud/shared";
import { isStructuredSearchQuery, parseStructuredSearchQuery } from "../structured-search/index.js";
import { type CcTrackQuery, getCcTrack, searchCcTracks } from "./jamendo/client.js";
import type { CcTrack } from "./jamendo/types.js";

/** Candidate-id prefix that marks a CC (Jamendo) candidate. */
const CC_CANDIDATE_PREFIX = "jamendo:";

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
 * Extracts the Jamendo id from a CC candidate id.
 *
 * @param candidateId - Candidate id from a prior disambiguation round.
 * @returns The Jamendo id, or null when the id is not a CC candidate.
 */
export function parseCcCandidateId(candidateId: string): string | null {
  return candidateId.startsWith(CC_CANDIDATE_PREFIX) ? candidateId.slice(CC_CANDIDATE_PREFIX.length) : null;
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
 * Leg 2: resolves a picked CC candidate id to its full track.
 *
 * @param candidateId - `jamendo:<id>` candidate id from leg 1.
 * @returns The full CC track, or null when Jamendo has no such track.
 * @throws Error when the candidate id is not a CC candidate.
 */
export async function resolveCcSelectedCandidate(candidateId: string): Promise<CcTrack | null> {
  const jamendoId = parseCcCandidateId(candidateId);
  if (!jamendoId) {
    throw new Error(`Not a CC candidate id: ${candidateId}`);
  }
  return getCcTrack(jamendoId);
}
