import {
  VfdBrightness,
  VfdDisplay,
  VfdMarqueeMode,
  VfdScrollOutDirection,
  type VfdScrollOutOverlay,
  VfdSectionAlign,
  VfdSectionCells,
  VfdSizingMode,
} from "@/components/ui/VfdDisplay";

/** Seek-hint overlay length in milliseconds, set by product (interactive tuning). */
const VFD_SEEK_HINT_DURATION_MS = 1400;

/**
 * Status-row marquee threshold: a status string longer than this many glyph
 * cells scrolls instead of being clipped, so long localized status text stays
 * fully readable on the centered fourth row.
 */
const STATUS_MARQUEE_CELL_THRESHOLD = 28;

/**
 * Glyph text rendered in the status row overlay per scroll-out direction.
 * Computed keys use the `VfdScrollOutDirection` namespace to satisfy the
 * domain-literals rule (`domain-literals/no-inline-discriminant-literals`).
 */
const SEEK_HINT_TEXT = {
  [VfdScrollOutDirection.Left]: "<< 10s",
  [VfdScrollOutDirection.Right]: "10s >>",
} as const;

/**
 * Props for {@link VfdInfoDisplay}.
 *
 * The component is a pure presentation of pre-computed track strings: the
 * caller (e.g. `SongInfo`) owns how `detailLine` and `metaLine` are derived
 * from album/explicit/duration/release data, so this display stays reusable
 * and free of song-metadata rules.
 */
export interface VfdInfoDisplayProps {
  /** Track title, rendered on the first row beside the right-pinned meta text. */
  title: string;
  /** Artist name, rendered on the second row. */
  artist: string;
  /** Third-row detail text (e.g. album · explicit marker). */
  detailLine: string;
  /**
   * Right-pinned meta text on the first row (e.g. duration · year). When empty,
   * the title claims the full first row instead of sharing it with a meta section.
   */
  metaLine: string;
  /** Centered fourth-row status text. Scrolls as a marquee past the cell threshold. */
  statusLine: string;
  /**
   * Transient seek-hint trigger forwarded to the status row overlay. A changed
   * `nonce` re-arms the overlay from the start even when the direction repeats.
   * `null`/omitted means no overlay is active.
   */
  seekHint?: { direction: VfdScrollOutDirection; nonce: number } | null;
}

/**
 * Four-row track-information VFD display.
 *
 * Composes the generic {@link VfdDisplay} into the fixed Track-info layout used
 * by the player/share card:
 *
 * - Row 1: title (left, marquee on overflow) with optional right-pinned meta.
 * - Row 2: artist.
 * - Row 3: detail line.
 * - Row 4: centered status line, marquee past {@link STATUS_MARQUEE_CELL_THRESHOLD}
 *   cells, with an optional transient seek-hint scroll-out overlay.
 *
 * Every row renders at full phosphor intensity (`bright`) for maximum
 * legibility. Sizing follows the outer container (`VfdSizingMode.Container`),
 * so the height stays fixed while text changes refresh via the canvas engine.
 */
export function VfdInfoDisplay({ title, artist, detailLine, metaLine, statusLine, seekHint }: VfdInfoDisplayProps) {
  const shouldMarqueeStatus = statusLine.length > STATUS_MARQUEE_CELL_THRESHOLD;

  /**
   * Transient scroll-out overlay for the status row, built from the seek-hint
   * trigger. Undefined when no hint is active. Each new `nonce` value re-arms
   * the overlay from the start even when the direction repeats ("jeder Druck neu").
   */
  const statusOverlay: VfdScrollOutOverlay | undefined = seekHint
    ? {
        text: SEEK_HINT_TEXT[seekHint.direction],
        direction: seekHint.direction,
        durationMs: VFD_SEEK_HINT_DURATION_MS,
        nonce: seekHint.nonce,
      }
    : undefined;

  return (
    <VfdDisplay
      sizingMode={VfdSizingMode.Container}
      ariaLabel={`Track information: ${title} ${artist} ${detailLine} ${statusLine}`}
      lines={[
        {
          brightness: VfdBrightness.Bright,
          sections: metaLine
            ? [
                {
                  content: title,
                  cells: VfdSectionCells.Fill,
                  align: VfdSectionAlign.Left,
                  marquee: VfdMarqueeMode.Overflow,
                },
                // Keep duration/year pinned on the right while the
                // title gets the remaining cells and scrolls only if
                // it overflows. VfdDisplay stays generic: it only
                // knows section sizing/alignment, not song metadata.
                {
                  content: ` ${metaLine}`,
                  cells: VfdSectionCells.Auto,
                  align: VfdSectionAlign.Right,
                },
              ]
            : [
                {
                  content: title,
                  cells: VfdSectionCells.Fill,
                  align: VfdSectionAlign.Left,
                  marquee: VfdMarqueeMode.Overflow,
                },
              ],
        },
        { content: artist, brightness: VfdBrightness.Bright },
        { content: detailLine, brightness: VfdBrightness.Bright },
        {
          content: statusLine,
          brightness: VfdBrightness.Bright,
          align: VfdSectionAlign.Center,
          marquee: shouldMarqueeStatus,
          scrollOutOverlay: statusOverlay,
        },
      ]}
    />
  );
}
