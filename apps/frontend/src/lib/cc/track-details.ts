import type { CcTrackContentConfiguration } from "@/lib/types/media-card";

/**
 * Whether a CC track carries enough enrichment to warrant the details section.
 *
 * True when Jamendo returned a non-empty classification (`musicInfo`) or at least
 * one positive engagement counter (`stats`).
 * {@link import("@/components/cards/CcTrackDetailsSection").CcTrackDetailsSection}
 * guards on this so the section — divider and all — disappears entirely for tracks
 * with nothing to show, instead of rendering an empty shell or leaving a hollow gap.
 *
 * The stats check is value-aware (counters must be `> 0`): Jamendo returns a
 * `stats` object even for a brand-new track whose every counter is 0, and that
 * carries no information worth a row. Keeping this in lockstep with the section's
 * own row filters guarantees a `true` here always yields at least one rendered
 * row.
 *
 * @param content - The resolved CC track content configuration.
 * @returns True when a details card has something to show.
 */
export function hasCcTrackDetails(content: CcTrackContentConfiguration): boolean {
  const mi = content.musicInfo;
  if (
    mi &&
    (mi.genres.length > 0 ||
      mi.instruments.length > 0 ||
      mi.vartags.length > 0 ||
      mi.vocalInstrumental ||
      mi.gender ||
      mi.speed ||
      mi.acousticElectric ||
      mi.lang)
  ) {
    return true;
  }
  const st = content.stats;
  if (st && (st.listens > 0 || st.downloads > 0 || st.favorited > 0 || st.playlisted > 0 || st.notes > 0)) {
    return true;
  }
  return false;
}
