import type { VinylLayout, VinylSide } from "@musiccloud/shared";

function normalizedTitle(title: string | null | undefined): string | null {
  const normalized = title?.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  return normalized || null;
}

/**
 * Finds the physical vinyl side containing a track with the supplied title.
 *
 * Matching is case-insensitive and collapses surrounding or repeated
 * whitespace. No positional fallback is used when a title is unavailable or
 * absent from the layout.
 *
 * @param layout - The normalized Discogs vinyl layout, if one is available.
 * @param trackTitle - The currently playing track title.
 * @returns The matching vinyl side, or `null` when no stable title match exists.
 */
export function sideForTrackTitle(
  layout: VinylLayout | null | undefined,
  trackTitle: string | null | undefined,
): VinylSide | null {
  const wantedTitle = normalizedTitle(trackTitle);
  if (!layout || !wantedTitle) return null;

  return layout.sides.find((side) => side.tracks.some((track) => normalizedTitle(track.title) === wantedTitle)) ?? null;
}
