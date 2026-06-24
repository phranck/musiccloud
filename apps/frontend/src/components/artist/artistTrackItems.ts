import type { ArtistInfoResponse } from "@musiccloud/shared";
import type { ArtistTrackItem } from "@/components/artist/artistPanelTypes";
import { hasResolvedTrack } from "@/components/artist/similarArtistTracks";

/**
 * Normalizes an artist's own top tracks into {@link ArtistTrackItem} rows (no
 * `artistLabel` — the subline falls back to the album name). Empty when no data.
 *
 * @param data - The artist-info payload, or `null` while loading.
 * @returns The normalized rows for the popular-tracks list/grid.
 */
export function toPopularTrackItems(data: ArtistInfoResponse | null): ArtistTrackItem[] {
  return (data?.topTracks ?? []).map((track) => ({ track }));
}

/**
 * Normalizes the similar-artist tracks into {@link ArtistTrackItem} rows, keeping
 * only entries that resolved to a playable track (so page counts match what is
 * shown) and carrying the other artist's name as the row's `artistLabel`.
 *
 * @param data - The artist-info payload, or `null` while loading.
 * @returns The normalized rows for the similar-tracks list/grid.
 */
export function toSimilarTrackItems(data: ArtistInfoResponse | null): ArtistTrackItem[] {
  return (data?.similarArtistTracks ?? [])
    .filter(hasResolvedTrack)
    .map(({ artistName, track }) => ({ track, artistLabel: artistName }));
}
