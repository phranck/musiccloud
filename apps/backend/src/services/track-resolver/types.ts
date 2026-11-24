/**
 * @file Public result types of the track resolve pipeline.
 *
 * `services/resolver.ts` re-exports all three, so callers import them from
 * there.
 */
import type { MatchMethod } from "@musiccloud/shared";
import type { ExternalIdRecord, NormalizedTrack, SearchCandidate, ServiceId } from "../types.js";

/** One destination of a resolved track on one service, with the metadata that service reported. */
export interface ResolvedLink {
  service: ServiceId;
  displayName: string;
  url: string;
  confidence: number;
  matchMethod: MatchMethod;
  /** Service-specific track ID (e.g. Spotify track ID, Deezer track ID) */
  externalId?: string;
  /** 30-second audio preview URL from this service (if available) */
  previewUrl?: string;
  /**
   * Cover this service returned for the track, which `withKeptArtwork` may
   * borrow when the source track has none to keep. `toApiLinks` copies named
   * link fields only, so the cover never reaches the API response.
   */
  artworkUrl?: string;
  /**
   * ISRC reported by this service for the track. May differ from the
   * source track's ISRC for regional variants / re-releases. That is
   * precisely the surface we want to aggregate. Optional because not
   * every adapter exposes an ISRC for every match.
   */
  isrc?: string;
  /**
   * MusicBrainz Recording MBID reported by this service for the track.
   * Today only the MusicBrainz adapter populates this; other adapters
   * leave it undefined. Drives `track_external_ids` aggregation.
   */
  mbid?: string;
  /**
   * ISWC of the underlying composition (work). Populated by the
   * MusicBrainz adapter when work-rels are returned. Drives
   * `track_external_ids` aggregation as `idType='iswc'`.
   */
  iswc?: string;
}

/** A resolved track: its canonical metadata, its links and the identifiers gathered on the way. */
export interface ResolutionResult {
  sourceTrack: NormalizedTrack;
  links: ResolvedLink[];
  trackId?: string; // present when loaded from cache
  /** The stored share id, present when loaded from cache. */
  shortId?: string;
  /**
   * External-id observations harvested across every adapter contacted
   * during the resolve. Persisted into `track_external_ids` so the
   * aggregation grows beyond the single canonical `tracks.isrc`.
   * Always present; empty array when the resolve produced no IDs
   * (e.g. cache hit where re-collection is skipped).
   */
  externalIds: ExternalIdRecord[];
  /**
   * Links from services that were still running when the resolve answered.
   * Settles, never rejects, once they have all answered. Whoever persists the
   * result hands it to `persistLateTrackLinks` in `persist-links.ts` with the
   * new track id.
   */
  lateLinks?: Promise<ResolvedLink[]>;
}

/**
 * The outcome of a text search: one resolved track, or candidates to pick from.
 *
 * @property kind - `resolved` when `result` is set, `disambiguation` when `candidates` is.
 */
export interface TextSearchResult {
  kind: "resolved" | "disambiguation";
  result?: ResolutionResult;
  candidates?: SearchCandidate[];
}
