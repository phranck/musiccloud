import type { SimilarArtistTrack } from "@musiccloud/shared";

/** A similar-artist entry that actually resolved to a playable track. */
export type ResolvedSimilarArtist = SimilarArtistTrack & { track: NonNullable<SimilarArtistTrack["track"]> };

/**
 * Type guard for similar-artist entries that resolved to a playable track. A
 * name-only entry is a dead end (nothing to click or preview), so callers drop
 * it before rendering or paging. Filtering must happen before pagination so the
 * page counts match what is actually shown.
 */
export function hasResolvedTrack(entry: SimilarArtistTrack): entry is ResolvedSimilarArtist {
  return entry.track != null;
}
