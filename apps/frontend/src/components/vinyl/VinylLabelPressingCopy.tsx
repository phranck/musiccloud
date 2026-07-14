import type { CSSProperties } from "react";
import { VINYL_LABEL_TEXT_STYLE } from "./VinylLabelPressingCopy.styles";

interface VinylLabelPressingCopyProps {
  catalogText: string;
  /** Optional vertical position for the centred catalog mark. */
  catalogY?: number;
  /** Optional Generic-label horizontal position for SIDE and its side letter. */
  lowerCopySideX?: number;
  /** Optional Generic-label horizontal position for STEREO. */
  lowerCopyStereoX?: number;
  /** Optional Generic-label adjustment for SIDE and STEREO without moving the catalog row. */
  lowerCopyOffsetY?: number;
  rightsText: string;
  sideLetter: string;
}

/** Summer Favourite: the stylised STEREO pressing mark. */
const VINYL_LABEL_STEREO_STYLE = {
  fontFamily: '"Summer Favourite", var(--font-sans)',
} satisfies CSSProperties;

/**
 * Shared pressing-plant copy used by every full-size paper label.
 *
 * The positions, fonts, weights and spacing deliberately live in this single
 * SVG fragment so the Generic and artwork-backed labels cannot drift apart.
 */
export function VinylLabelPressingCopy({
  catalogText,
  catalogY = 65,
  lowerCopySideX = 38,
  lowerCopyStereoX = 60,
  lowerCopyOffsetY = 0,
  rightsText,
  sideLetter,
}: VinylLabelPressingCopyProps) {
  return (
    <g data-vinyl-label-pressing-copy="true">
      <text
        fill="rgba(255, 255, 255, 0.68)"
        fontSize="3.35"
        fontWeight="400"
        letterSpacing="0.5"
        style={VINYL_LABEL_TEXT_STYLE}
      >
        <tspan data-vinyl-label-gema="true" x="8" y="65">
          {rightsText}
        </tspan>
        <tspan data-vinyl-label-catalog="true" textAnchor="middle" x="50" y={catalogY}>
          {catalogText}
        </tspan>
        <tspan data-vinyl-label-tech="true" textAnchor="end" x="92" y="65">
          DMM
        </tspan>
      </text>
      <g
        data-vinyl-label-lower-copy="true"
        transform={lowerCopyOffsetY === 0 ? undefined : `translate(0 ${lowerCopyOffsetY})`}
      >
        <text
          fill="rgba(255, 255, 255, 0.82)"
          fontWeight="700"
          letterSpacing="0.6"
          style={VINYL_LABEL_TEXT_STYLE}
          textAnchor="middle"
        >
          <tspan data-vinyl-label-side="true" fontSize="3.4" x={lowerCopySideX} y="70">
            SIDE
          </tspan>
          <tspan data-vinyl-label-side-letter="true" fontSize="5.4" letterSpacing="0" x={lowerCopySideX} y="75">
            {sideLetter}
          </tspan>
        </text>
        <text
          data-vinyl-label-stereo="true"
          fill="rgba(255, 255, 255, 0.9)"
          fontSize="10.2"
          style={VINYL_LABEL_STEREO_STYLE}
          textAnchor="middle"
          x={lowerCopyStereoX}
          y="74.5"
        >
          STEREO
        </text>
      </g>
    </g>
  );
}
