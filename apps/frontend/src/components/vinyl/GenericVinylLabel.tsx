import type { CSSProperties } from "react";
import { NIGHT_SKY_DEFAULTS } from "@/components/background/nightSky/settings.js";
import { labelArcPath } from "@/lib/media/vinyl-geometry.js";
import { VinylLabelPressingCopy } from "./VinylLabelPressingCopy";
import { VINYL_LABEL_TEXT_STYLE } from "./VinylLabelPressingCopy.styles";

interface GenericVinylLabelProps {
  /** A 7-inch 45 RPM single needs room for its large centre opening. */
  hasSingleCentreOpening: boolean;
  /** Prefix supplied by the owning record so SVG fragment IDs stay instance-safe. */
  idPrefix: string;
  /** Resolved Discogs side, or A for a generic pressing without side metadata. */
  sideLetter: string;
}

const GENERIC_WORDMARK_ARC_PATH = labelArcPath(46, 83);
const GENERIC_COPYRIGHT_ARC_PATH = "M 4 50 A 46 46 0 0 1 96 50";
const GENERIC_IMPRINT_ARC_PATH = labelArcPath(34.5, 78);

/** Audiowide: the curved musiccloud wordmark. */
const WORDMARK_STYLE = {
  fontFamily: '"Audiowide", var(--font-sans)',
} satisfies CSSProperties;

/**
 * Reusable paper label for search progress and records without cover artwork.
 *
 * The whole paper face is one live SVG: its cloudy daylight, night gradient, rim,
 * metadata and concentric text paths scale together without rasterising the
 * typography. The physical vinyl remains a separate SVG layer owned by
 * VinylRecord.
 */
export function GenericVinylLabel({ hasSingleCentreOpening, idPrefix, sideLetter }: GenericVinylLabelProps) {
  const currentYear = new Date().getFullYear();
  const clipId = `${idPrefix}-generic-clip`;
  const skyId = `${idPrefix}-generic-sky`;
  const cloudId = `${idPrefix}-generic-clouds`;
  const grainId = `${idPrefix}-generic-grain`;
  const copyrightPathId = `${idPrefix}-generic-copyright-path`;
  const wordmarkPathId = `${idPrefix}-generic-wordmark-path`;
  const imprintPathId = `${idPrefix}-generic-imprint-path`;
  const wordmarkGradientId = `${idPrefix}-generic-wordmark-gradient`;

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      data-vinyl-generic-label="true"
      viewBox="0 0 100 100"
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx="50" cy="50" r="49" />
        </clipPath>
        <linearGradient
          data-vinyl-generic-day-gradient="true"
          id={skyId}
          x1="50"
          x2="50"
          y1="0"
          y2="50"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor={NIGHT_SKY_DEFAULTS.skyTopDay} />
          <stop offset="1" stopColor={NIGHT_SKY_DEFAULTS.skyBottomDay} />
        </linearGradient>
        <filter colorInterpolationFilters="sRGB" id={cloudId} x="-12%" y="-20%" width="124%" height="150%">
          <feTurbulence
            data-vinyl-generic-cloud-noise="true"
            baseFrequency="0.011 0.022"
            numOctaves="4"
            seed="17"
            stitchTiles="stitch"
            type="fractalNoise"
            result="noise"
          />
          <feColorMatrix in="noise" type="luminanceToAlpha" result="noiseAlpha" />
          <feComponentTransfer in="noiseAlpha" result="cloudMask">
            <feFuncA
              data-vinyl-generic-cloud-coverage="true"
              type="table"
              tableValues="0 0 0 0.03 0.14 0.38 0.7 0.94 1 1"
            />
          </feComponentTransfer>
          <feGaussianBlur in="cloudMask" stdDeviation="0.22" result="softMask" />
          <feFlood
            data-vinyl-generic-cloud-shadow="true"
            floodColor="#3f6073"
            floodOpacity="0.95"
            result="shadowColor"
          />
          <feComposite in="shadowColor" in2="softMask" operator="in" result="cloudShadow" />
          <feOffset
            data-vinyl-generic-cloud-shadow-offset="true"
            dy="1.2"
            in="cloudShadow"
            result="cloudShadowOffset"
          />
          <feFlood floodColor={NIGHT_SKY_DEFAULTS.cloudColorDay} floodOpacity="1" result="lightColor" />
          <feComposite in="lightColor" in2="softMask" operator="in" result="cloudLight" />
          <feGaussianBlur in="cloudLight" stdDeviation="0.08" result="cloudLightSoft" />
          <feMerge>
            <feMergeNode in="cloudShadowOffset" />
            <feMergeNode in="cloudLightSoft" />
          </feMerge>
        </filter>
        <filter id={grainId} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence baseFrequency="0.72" numOctaves="2" seed="9" type="fractalNoise" />
          <feColorMatrix
            values="0 0 0 0 1
                    0 0 0 0 1
                    0 0 0 0 1
                    0 0 0 0.13 0"
          />
        </filter>
        <linearGradient
          data-vinyl-generic-wordmark-gradient="true"
          id={wordmarkGradientId}
          x1="0%"
          x2="100%"
          y1="0%"
          y2="0%"
          gradientUnits="objectBoundingBox"
        >
          <stop offset="0" stopColor="#ff6699" />
          <stop offset="0.14" stopColor="#9966ff" />
          <stop offset="0.28" stopColor="#4d99ff" />
          <stop offset="0.42" stopColor="#00cce6" />
          <stop offset="0.57" stopColor="#00e6b3" />
          <stop offset="0.71" stopColor="#80e64d" />
          <stop offset="0.85" stopColor="#e6e64d" />
          <stop offset="1" stopColor="#ffb34d" />
        </linearGradient>
        <path d={GENERIC_COPYRIGHT_ARC_PATH} data-vinyl-generic-copyright-path="true" id={copyrightPathId} />
        <path d={GENERIC_WORDMARK_ARC_PATH} data-vinyl-generic-wordmark-path="true" id={wordmarkPathId} />
        <path d={GENERIC_IMPRINT_ARC_PATH} data-vinyl-generic-imprint-path="true" id={imprintPathId} />
      </defs>

      <g clipPath={`url(#${clipId})`}>
        <rect fill={`url(#${skyId})`} height="50" width="100" />
        <g data-vinyl-generic-clouds="true">
          <rect
            data-vinyl-generic-cloud-layer="true"
            fill="transparent"
            filter={`url(#${cloudId})`}
            height="54"
            opacity="1"
            width="108"
            x="-4"
            y="-3"
          />
        </g>

        <rect data-vinyl-generic-night-sky="true" fill="#030405" height="50" width="100" y="50" />
        <text
          data-vinyl-generic-copyright="true"
          fill="#000000"
          fontSize="2.15"
          fontWeight="500"
          letterSpacing="0.28"
          style={VINYL_LABEL_TEXT_STYLE}
        >
          <textPath href={`#${copyrightPathId}`} startOffset="50%" textAnchor="middle">
            Copyright {currentYear} • Proudly crafted and presented by{" "}
            <tspan data-vinyl-generic-copyright-brand="true" fontWeight="700">
              musiccloud
            </tspan>{" "}
            in Bregenz at Lake Constance in Austria
          </textPath>
        </text>
        <g data-vinyl-generic-pressing-copy="true" transform="translate(0 -8)">
          <VinylLabelPressingCopy
            catalogText="MC-GSP-001"
            catalogY={hasSingleCentreOpening ? 34 : 65}
            lowerCopySideX={hasSingleCentreOpening ? 18 : 32}
            lowerCopyStereoX={hasSingleCentreOpening ? 84 : 68}
            lowerCopyOffsetY={3}
            rightsText="GEMA"
            sideLetter={sideLetter}
          />
        </g>

        <text
          data-vinyl-generic-imprint="true"
          fill="#dff8ff"
          fontSize="2.15"
          fontWeight="500"
          letterSpacing="0.28"
          style={VINYL_LABEL_TEXT_STYLE}
        >
          <textPath href={`#${imprintPathId}`} startOffset="50%" textAnchor="middle">
            LIMITED SPATIAL AUDIO EDITION
          </textPath>
        </text>
        <text
          data-vinyl-generic-wordmark="true"
          fill={`url(#${wordmarkGradientId})`}
          fontSize="8.55"
          letterSpacing="1.35"
          paintOrder="stroke"
          stroke="#000000"
          strokeLinejoin="round"
          strokeWidth="0.12"
          style={WORDMARK_STYLE}
        >
          <textPath href={`#${wordmarkPathId}`} startOffset="50%" textAnchor="middle">
            musiccloud
          </textPath>
        </text>
        <circle cx="50" cy="50" fill="#ffffff" filter={`url(#${grainId})`} opacity="0.055" r="49" />
        <circle cx="50" cy="50" fill="none" r="48.7" stroke="#ffffff" strokeOpacity="0.18" strokeWidth="0.45" />
      </g>
    </svg>
  );
}
