import type { ArtistInfoResponse, ArtistTopTrack } from "@musiccloud/shared";
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

/**
 * The secondary line shown under a track's title in both the list row and the
 * grid item, so the two presentations stay in lockstep: the other artist's name
 * for similar tracks, otherwise the album name when it differs from the title,
 * and nothing when neither applies.
 *
 * @param track - The track whose album name is the popular-track fallback.
 * @param artistLabel - The similar-artist label, when this is a similar track.
 * @returns The subline string, or `undefined` when there is none.
 */
export function getTrackSubline(track: ArtistTopTrack, artistLabel?: string): string | undefined {
  if (artistLabel) return artistLabel;
  if (track.albumName && track.albumName !== track.title) return track.albumName;
  return undefined;
}
