/**
 * localStorage keys for the per-section list/grid view preference, fed to
 * {@link import("@/hooks/useTrackListView").useTrackListView}. One key per
 * logical section (popular vs. similar), shared across viewports and modes so
 * the desktop card and the mobile section of the same section remember the same
 * view — and so the strings live in one place instead of being duplicated as
 * literals at each call site.
 *
 * Config strings, not a domain-literal namespace: the keys are never compared as
 * discriminants, so they stay a plain config map.
 */
export const ArtistTrackViewKey = {
  /** View preference for the artist's own popular tracks. */
  Popular: "mc:artistTrackView:popular",
  /** View preference for similar-artist tracks. */
  Similar: "mc:artistTrackView:similar",
} as const;
