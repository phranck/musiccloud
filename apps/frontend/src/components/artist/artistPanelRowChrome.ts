/**
 * Shared, token-driven chrome for every list row that reads as an artist-panel /
 * candidate row: popular tracks, upcoming events, similar artists, the
 * disambiguation candidates, and the genre-search result rows.
 *
 * Token-driven so all of these lists respond identically to the tuned spacing:
 * `--mc-gap-rowitem` between the leading visual and the text, `--mc-pad-track`
 * for the top/bottom/left padding, and `--mc-pad-tracktime` for the right
 * (trailing) padding around the duration/icon. The fallbacks match the prototype
 * defaults.
 *
 * Lives in its own `.ts` module (not on a component) so it can be imported by
 * `ArtistPanelRow`, `DisambiguationPanel` and `GenreRowButton` without a
 * non-component export tripping the `only-export-components` rule.
 */
export const ROW_CHROME =
  "flex items-center gap-[var(--mc-gap-rowitem,0.75rem)] w-full py-[var(--mc-pad-track,0.25rem)] pl-[var(--mc-pad-track,0.25rem)] pr-[var(--mc-pad-tracktime,0.5rem)]";
