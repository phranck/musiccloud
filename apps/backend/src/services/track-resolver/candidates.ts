/**
 * @file Picks the disambiguation candidates of a text search so the list
 * spreads across albums before it repeats one.
 */
import { CANDIDATE_MIN_CONFIDENCE } from "../constants.js";
import type { SearchResultWithCandidates } from "../types.js";

/** One scored candidate as an adapter's candidate search returns it. */
type RankedSearchCandidate = SearchResultWithCandidates["candidates"][number];

/**
 * Normalizes one part of a candidate key so case and spacing do not split it.
 *
 * @param value - An artist or album name, or `undefined`.
 * @returns The trimmed, lowercased value with runs of whitespace collapsed;
 *   an empty string for `undefined`.
 */
function normalizeCandidateKeyPart(value: string | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

/**
 * Names the album a candidate belongs to, falling back to its artwork and then
 * to the track itself when the album name is missing.
 *
 * @param candidate - The candidate to key.
 * @returns An `album:`, `artwork:` or `track:` key.
 */
function candidateAlbumKey(candidate: RankedSearchCandidate): string {
  const artistKey = candidate.track.artists.map((artist) => normalizeCandidateKeyPart(artist)).join(",");
  const albumKey = normalizeCandidateKeyPart(candidate.track.albumName);
  if (albumKey) return `album:${artistKey}:${albumKey}`;
  if (candidate.track.artworkUrl) return `artwork:${candidate.track.artworkUrl}`;
  return `track:${candidate.track.sourceService}:${candidate.track.sourceId}`;
}

/**
 * Selects up to `cap` candidates above {@link CANDIDATE_MIN_CONFIDENCE}, one
 * per album first and then the rest in rank order.
 *
 * @param candidates - The ranked candidates, best first.
 * @param cap - The most candidates to return.
 * @returns The selected candidates, each track at most once.
 */
export function selectDiverseSearchCandidates(
  candidates: RankedSearchCandidate[],
  cap: number,
): RankedSearchCandidate[] {
  const byTrack = new Map<string, RankedSearchCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.track.sourceService}:${candidate.track.sourceId}`;
    if (!byTrack.has(key)) byTrack.set(key, candidate);
  }

  const pool = [...byTrack.values()].filter((c) => c.confidence >= CANDIDATE_MIN_CONFIDENCE);
  const selected: RankedSearchCandidate[] = [];
  const usedAlbums = new Set<string>();

  for (const candidate of pool) {
    if (selected.length >= cap) break;
    const albumKey = candidateAlbumKey(candidate);
    if (usedAlbums.has(albumKey)) continue;
    selected.push(candidate);
    usedAlbums.add(albumKey);
  }

  for (const candidate of pool) {
    if (selected.length >= cap) break;
    if (selected.includes(candidate)) continue;
    selected.push(candidate);
  }

  return selected;
}
