/**
 * Fixed column geometry for the desktop two-column result view. `ShareLayout`'s
 * `DesktopShareLayout` renders both commercial and Creative-Commons results
 * through `TwoColumnResultGrid`, so these widths are the single source of truth.
 *
 * Lives in this plain module (not in `TwoColumnResultGrid.tsx`) so the component
 * file exports only its React component, keeping it Fast-Refresh-eligible.
 *
 * Keep the Tailwind grid track literal (`grid-cols-[512px_512px]` in
 * `TwoColumnResultGrid`) in sync with {@link MEDIA_W}/{@link ARTIST_W}.
 */
export const MEDIA_W = 512;
export const ARTIST_W = 512;

/** Gap between the two columns (px). Internal — only feeds {@link TWO_COLUMN_TOTAL_W}. */
const GAP = 24;

/** Total fixed width of the two-column grid (`MEDIA_W + GAP + ARTIST_W`). */
export const TWO_COLUMN_TOTAL_W = MEDIA_W + GAP + ARTIST_W;
