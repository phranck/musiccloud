import type { VinylLayout, VinylSide } from "@musiccloud/shared";

function normalizedTitle(title: string | null | undefined): string | null {
  const normalized = title
    ?.normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
  return normalized || null;
}

function hasUnambiguousDescriptiveMatch(layout: VinylLayout, wantedTitle: string): VinylSide | null {
  if (wantedTitle.split(" ").length < 3) return null;

  const matches = layout.sides.flatMap((side) =>
    side.tracks
      .filter((track) => {
        const candidateTitle = normalizedTitle(track.title);
        return candidateTitle?.endsWith(` ${wantedTitle}`) || wantedTitle.endsWith(` ${candidateTitle}`);
      })
      .map(() => side),
  );

  return matches.length === 1 ? (matches[0] ?? null) : null;
}

/**
 * Finds the physical vinyl side containing a track with the supplied title.
 *
 * Matching is case-insensitive and normalizes whitespace, punctuation and
 * diacritics. A single unambiguous descriptive-prefix match (for example
 * "Theme From …") is accepted; no positional fallback is used when a title is
 * unavailable or ambiguous.
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

  const exactSide = layout.sides.find((side) =>
    side.tracks.some((track) => normalizedTitle(track.title) === wantedTitle),
  );
  return exactSide ?? hasUnambiguousDescriptiveMatch(layout, wantedTitle);
}
