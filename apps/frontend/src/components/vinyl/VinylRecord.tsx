import type { VinylSide } from "@musiccloud/shared";
import type { CSSProperties } from "react";
import { useEffect, useId, useMemo, useRef } from "react";
import { labelArcPath, vinylGrooveSpiralPath, vinylSideGrooveLayout } from "@/lib/media/vinyl-geometry.js";
import { cn } from "@/lib/utils";
import { GenericVinylLabel } from "./GenericVinylLabel";
import { TurntableSpindle } from "./TurntableSpindle";
import { TurntableSpindlePlacement } from "./TurntableSpindlePlacement";
import { VinylLabelPressingCopy } from "./VinylLabelPressingCopy";
import { VINYL_LABEL_TEXT_STYLE } from "./VinylLabelPressingCopy.styles";
import {
  LP_COAST_DURATION_MS,
  VinylDiscFormat,
  type VinylDiscFormat as VinylDiscFormatValue,
  VinylLabelVariant,
  type VinylLabelVariant as VinylLabelVariantValue,
  VinylSpinState,
  type VinylSpinState as VinylSpinStateValue,
} from "./VinylRecord.types";

export interface VinylRecordProps {
  className: string;
  /** Physical disc body. LP is turntable-only; Single is compact-display-only. */
  discFormat: VinylDiscFormatValue;
  labelArtworkUrl?: string | null;
  labelTitle?: string | null;
  labelSubtitle?: string | null;
  labelYear?: string | null;
  labelCatalogText?: string | null;
  /** Top-left rights imprint. Defaults to "GEMA"; the CC path passes the licence label. */
  labelRightsText?: string | null;
  /** Visual label recipe. Missing artwork resolves to Generic when omitted. */
  labelVariant?: VinylLabelVariantValue;
  /** Whether this isolated record owns a visible stationary turntable spindle. */
  showTurntableSpindle?: boolean;
  sideLayout?: VinylSide;
  spinState?: VinylSpinStateValue;
}

const DEFAULT_LABEL_TITLE = "music cloud";
const DEFAULT_LABEL_SPEED = "33 1/3 RPM";
// Top-left rights imprint for commercial tracks; CC tracks override it with the
// licence label, where a collecting-society line would be meaningless.
const DEFAULT_LABEL_RIGHTS_TEXT = "GEMA";
const DEFAULT_LABEL_CATALOG_TEXT = "MC-4333";
// Top-right technical imprint. "DMM" (Direct Metal Mastering) is a generic,
// authentic vinyl mark, meaningful in both commercial and CC modes (unlike the
// commercial-only label code it replaces).
/**
 * One full rotor revolution at the physical speed of each record format.
 */
const LP_ROTATION_DURATION_MS = 1800;
const SINGLE_ROTATION_DURATION_MS = 4000 / 3;
const LP_COAST_DEGREES = 200;

/** Looping playing-spin timing by physical format, repeated forever. */
const PLAYING_ROTATION_TIMING = {
  [VinylDiscFormat.Lp]: {
    duration: LP_ROTATION_DURATION_MS,
    easing: "linear",
    iterations: Infinity,
  },
  [VinylDiscFormat.Single]: {
    duration: SINGLE_ROTATION_DURATION_MS,
    easing: "linear",
    iterations: Infinity,
  },
} satisfies Record<VinylDiscFormatValue, KeyframeAnimationOptions>;
const LP_COAST_TIMING = {
  duration: LP_COAST_DURATION_MS,
  // Decelerate easing whose initial slope (~2× the average) matches the playing
  // spin speed, so the coast picks up exactly where the spin left off instead of
  // momentarily slowing down (a visible "stutter") before easing out.
  easing: "cubic-bezier(0.1, 0.2, 0.3, 1)",
  // Holds the final angle when the 2s coast ends, so the rotor does not snap back
  // to its start angle for the one frame between the animation finishing and
  // `onfinish` pinning the inline transform.
  //
  // CRITICAL LEARNING (cost a long debug session): a finished `fill: forwards`
  // animation does NOT remove itself — it stays "in effect" in the element's Web
  // Animations stack and keeps overriding the transform. It MUST be cancelled
  // explicitly: see the `onfinish` cancel in `startRotorAnimation` AND the blanket
  // `getAnimations()` cancel in `preserveRotorRotationAndCancel`. Leaving even one
  // finished coast animation uncancelled is what made the rotor jump to a "random"
  // angle (really: the stale coast end-angle) after repeated play/pause/play.
  fill: "forwards",
} satisfies KeyframeAnimationOptions;
const LABEL_TITLE_ARC_RADIUS = 44;
const LABEL_TITLE_ARC_BASELINE = 73;
const LABEL_LEGAL_ARC_RADIUS = 48;
const LABEL_LEGAL_ARC_BASELINE = 89;
const LABEL_TITLE_ARC_PATH = labelArcPath(LABEL_TITLE_ARC_RADIUS, LABEL_TITLE_ARC_BASELINE);
const LABEL_LEGAL_ARC_PATH = labelArcPath(LABEL_LEGAL_ARC_RADIUS, LABEL_LEGAL_ARC_BASELINE);
const VINYL_GROOVE_TURNS = 72;
const VINYL_GROOVE_INNER_RADIUS = 19;
const VINYL_GROOVE_OUTER_RADIUS = 49.5;
const VINYL_GROOVE_SPIRAL_PATH = vinylGrooveSpiralPath(
  VINYL_GROOVE_TURNS,
  VINYL_GROOVE_INNER_RADIUS,
  VINYL_GROOVE_OUTER_RADIUS,
);
const VINYL_GROOVE_RADIAL_WIDTH = VINYL_GROOVE_OUTER_RADIUS - VINYL_GROOVE_INNER_RADIUS;
// Three deliberately unequal generic tracks (26% / 43% / 31%) create two
// pauses without changing the original 72-turn outside-in spiral itself.
const VINYL_GENERIC_PAUSE_BANDS = [
  { radius: VINYL_GROOVE_OUTER_RADIUS - VINYL_GROOVE_RADIAL_WIDTH * 0.26, width: 0.6 },
  { radius: VINYL_GROOVE_OUTER_RADIUS - VINYL_GROOVE_RADIAL_WIDTH * 0.69, width: 0.6 },
] as const;
// The spiral ships as a rasterised SVG bitmap behind an <img>, not an inline
// <svg>. A replaced element is rasterised once and cached as its own compositor
// layer, so spinning the rotor is a pure GPU transform. An inline <svg> with this
// ~72 KB vector path is re-rasterised every frame in Firefox/WebRender (which does
// not reliably cache a rotating vector layer) — that is what stuttered the spin
// there. The groove has no external fonts or images, so the secure-static mode an
// SVG carries inside an <img> imposes no constraint. Single quotes keep the data
// URL compact: encodeURIComponent does not escape them.
function vinylGrooveImageSrc(
  path: string,
  darkBands: ReadonlyArray<{ radius: number; width: number }> = [],
  darkBandStroke = "rgba(0,0,0,0.72)",
) {
  const darkBandSvg = darkBands
    .map(
      ({ radius, width }) =>
        `<circle cx='50' cy='50' r='${radius.toFixed(1)}' fill='none' stroke='${darkBandStroke}' stroke-width='${width.toFixed(1)}'/>`,
    )
    .join("");
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>` +
      darkBandSvg +
      `<path d='${path}' fill='none' stroke='rgba(0,0,0,0.5)' stroke-width='0.34'/>` +
      `<path d='${path}' fill='none' stroke='rgba(255,255,255,0.06)' stroke-width='0.14'/>` +
      `</svg>`,
  )}`;
}
const VINYL_GROOVE_IMAGE_SRC = vinylGrooveImageSrc(
  VINYL_GROOVE_SPIRAL_PATH,
  VINYL_GENERIC_PAUSE_BANDS,
  "rgba(0,0,0,0.34)",
);
const LABEL_TITLE_ARC_LENGTH = labelArcLength(LABEL_TITLE_ARC_RADIUS, LABEL_TITLE_ARC_BASELINE);

const VINYL_LABEL_INSET = {
  [VinylDiscFormat.Lp]: "32%",
  [VinylDiscFormat.Single]: "23%",
} satisfies Record<VinylDiscFormatValue, string>;

// The paper-label radii in the 100×100 physical-disc coordinate system. The
// stationary reflection uses matching format-specific inner stops so it never
// crosses either paper face.
const VINYL_LABEL_RADIUS = {
  [VinylDiscFormat.Lp]: 18,
  [VinylDiscFormat.Single]: 27,
} satisfies Record<VinylDiscFormatValue, number>;

const DISCOGS_LABEL_INSET = "32%";

// Vinyl-label imprint typography. Iosevka Charon Mono is monospace: every glyph
// advances exactly 0.5em, so imprint text can be fitted to the available arc by
// pure arithmetic (no DOM measurement, SSR-safe) instead of `textLength` /
// `lengthAdjust`, which Safari and Firefox render inconsistently on `<textPath>`.
const LABEL_FONT_ADVANCE_EM = 0.5;
// Letter-spacing expressed as a fraction of font-size so the tracking scales with
// the type instead of looking proportionally wider as the title shrinks.
const LABEL_TITLE_LETTER_SPACING_RATIO = 0.13;
const LABEL_SUBTITLE_LETTER_SPACING_RATIO = 0.06;
// Largest title size; shorter titles render at this, longer ones shrink to fit.
const LABEL_TITLE_MAX_FONT_SIZE = 4.3;
const LABEL_SUBTITLE_MAX_FONT_SIZE = 2.8;
// Straight (non-arc) imprint text widths, in viewBox units.
const LABEL_SUBTITLE_MAX_WIDTH = 66;
// Fraction of the arc the fitted title fills, leaving breathing room at the
// curved ends where glyphs would otherwise crowd the upturn.
const LABEL_TITLE_ARC_FILL = 0.92;
const LABEL_LEGAL_FONT_SIZE = 1.9;
const LABEL_LEGAL_LETTER_SPACING = 0.2;

const RECORD_SURFACE_STYLE = {
  backgroundColor: "#030304",
  // Concentric groove rings removed — the single spiral groove (rendered as an
  // SVG layer) now carries the grooves. Kept: spindle ring, faint angular sheen,
  // and the base radial shade.
  backgroundImage:
    "radial-gradient(circle at 50% 50%, transparent 0 18.5%, rgba(0, 0, 0, 0.98) 18.8% 20.2%, transparent 20.6%), repeating-conic-gradient(from 0deg, rgba(255, 255, 255, 0.009) 0deg 0.8deg, transparent 0.8deg 7deg), radial-gradient(circle at 50% 50%, #232527 0, #111214 54%, #030304 100%)",
  boxShadow:
    "inset 0 0 0 2px rgba(255, 255, 255, 0.05), inset 0 0 0 7px rgba(0, 0, 0, 0.56), inset 0 0 28px rgba(255, 255, 255, 0.065), inset 0 -15px 30px rgba(0, 0, 0, 0.48)",
} satisfies CSSProperties;

// Normal compositing (no mix-blend-mode): over the near-black record the
// screen-blended highlights look the same, and keeping mix-blend off the
// rotating rotor avoids a per-frame re-blend that stutters the spin in
// Firefox/WebRender.
const RECORD_DETAIL_STYLE = {
  backgroundImage:
    "radial-gradient(circle at 50% 50%, transparent 0 24%, rgba(255, 255, 255, 0.035) 24.3% 24.8%, transparent 25.1% 42%, rgba(255, 255, 255, 0.028) 42.4% 42.9%, transparent 43.2%), radial-gradient(circle at 50% 50%, transparent 0 29.4%, rgba(255, 255, 255, 0.035) 29.75%, transparent 30.25%, transparent 45.6%, rgba(255, 255, 255, 0.03) 45.95%, transparent 46.45%, transparent 61.2%, rgba(255, 255, 255, 0.032) 61.55%, transparent 62.08%, transparent 74.2%, rgba(255, 255, 255, 0.03) 74.55%, transparent 75.1%, transparent 100%), repeating-radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.026) 0 0.7px, transparent 0.7px 2.2px, rgba(0, 0, 0, 0.2) 2.2px 2.8px, transparent 2.8px 4.8px)",
  opacity: 0.72,
} satisfies CSSProperties;

const RECORD_EDGE_STYLE = {
  backgroundImage:
    "radial-gradient(circle at 50% 50%, transparent 0 68%, rgba(255, 255, 255, 0.035) 70%, transparent 72%), radial-gradient(circle at 50% 50%, transparent 0 92%, rgba(0, 0, 0, 0.28) 100%)",
} satisfies CSSProperties;

const RECORD_REFLECTION_MASK =
  "radial-gradient(circle at 50% 50%, transparent 0 28%, rgba(0, 0, 0, 0.72) 31%, #000 78%, transparent 99%)";

// CSS radial-gradient percentages are measured against the farthest corner,
// whose radius is √(50² + 50²) in this square. Mapping the SVG pause radii to
// that gradient keeps the stationary light/rainbow sheen cut out at exactly the
// same two concentric bands as the rotating groove image.
const REFLECTION_GRADIENT_RADIUS = Math.hypot(50, 50);

function reflectionMaskStop(radius: number) {
  return `${((radius / REFLECTION_GRADIENT_RADIUS) * 100).toFixed(1)}%`;
}

// The existing LP fade begins 2.5 / 5.5 gradient points outside its paper
// edge. Applying the same physical clearance to the 27-unit Single label gives
// 40.7% / 43.7%, clipping the stationary light and rainbow at its larger rim.
function reflectionMaskInnerStops(discFormat: VinylDiscFormatValue) {
  const labelEdge = (VINYL_LABEL_RADIUS[discFormat] / REFLECTION_GRADIENT_RADIUS) * 100;
  return {
    fadeStart: `${(labelEdge + 2.5).toFixed(1)}%`,
    fadeEnd: `${(labelEdge + 5.5).toFixed(1)}%`,
  };
}

const [OUTER_PAUSE_BAND, INNER_PAUSE_BAND] = VINYL_GENERIC_PAUSE_BANDS;
const INNER_PAUSE_START = reflectionMaskStop(INNER_PAUSE_BAND.radius - INNER_PAUSE_BAND.width / 2);
const INNER_PAUSE_END = reflectionMaskStop(INNER_PAUSE_BAND.radius + INNER_PAUSE_BAND.width / 2);
const OUTER_PAUSE_START = reflectionMaskStop(OUTER_PAUSE_BAND.radius - OUTER_PAUSE_BAND.width / 2);
const OUTER_PAUSE_END = reflectionMaskStop(OUTER_PAUSE_BAND.radius + OUTER_PAUSE_BAND.width / 2);
function genericRecordReflectionMask(discFormat: VinylDiscFormatValue) {
  const { fadeEnd, fadeStart } = reflectionMaskInnerStops(discFormat);
  return (
    "radial-gradient(circle at 50% 50%, transparent 0 " +
    fadeStart +
    ", rgba(0, 0, 0, 0.72) " +
    fadeEnd +
    ", " +
    "rgba(0, 0, 0, 0.77) " +
    INNER_PAUSE_START +
    ", rgba(0, 0, 0, 0.5) " +
    INNER_PAUSE_START +
    " " +
    INNER_PAUSE_END +
    ", rgba(0, 0, 0, 0.78) " +
    INNER_PAUSE_END +
    ", rgba(0, 0, 0, 0.88) " +
    OUTER_PAUSE_START +
    ", rgba(0, 0, 0, 0.5) " +
    OUTER_PAUSE_START +
    " " +
    OUTER_PAUSE_END +
    ", rgba(0, 0, 0, 0.89) " +
    OUTER_PAUSE_END +
    ", #000 78%, transparent 99%)"
  );
}

const GENERIC_RECORD_REFLECTION_MASK = genericRecordReflectionMask(VinylDiscFormat.Lp);
const SINGLE_GENERIC_RECORD_REFLECTION_MASK = genericRecordReflectionMask(VinylDiscFormat.Single);

const RECORD_REFLECTION_STYLE = {
  WebkitMaskImage: RECORD_REFLECTION_MASK,
  backgroundImage:
    "conic-gradient(from 292deg at 50% 50%, transparent 0deg 8deg, rgba(255, 255, 255, 0.08) 15deg, rgba(255, 255, 255, 0.36) 30deg, rgba(255, 255, 255, 0.2) 45deg, rgba(255, 255, 255, 0.07) 63deg, transparent 82deg 184deg, rgba(255, 255, 255, 0.06) 194deg, rgba(255, 255, 255, 0.3) 214deg, rgba(255, 255, 255, 0.17) 232deg, rgba(255, 255, 255, 0.055) 252deg, transparent 274deg 360deg), conic-gradient(from 292deg at 50% 50%, transparent 0deg 11deg, rgba(255, 56, 82, 0.17) 17deg, rgba(255, 218, 76, 0.2) 24deg, rgba(86, 255, 182, 0.16) 31deg, rgba(74, 176, 255, 0.2) 39deg, rgba(164, 112, 255, 0.14) 48deg, transparent 66deg 190deg, rgba(255, 56, 82, 0.12) 200deg, rgba(255, 218, 76, 0.15) 208deg, rgba(86, 255, 182, 0.12) 217deg, rgba(74, 176, 255, 0.15) 226deg, rgba(164, 112, 255, 0.11) 236deg, transparent 258deg 360deg), radial-gradient(ellipse at 24% 20%, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.08) 26%, transparent 45%), radial-gradient(ellipse at 76% 71%, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.075) 25%, transparent 44%)",
  maskImage: RECORD_REFLECTION_MASK,
  opacity: 0.84,
} satisfies CSSProperties;

const GENERIC_RECORD_REFLECTION_STYLE = {
  ...RECORD_REFLECTION_STYLE,
  WebkitMaskImage: GENERIC_RECORD_REFLECTION_MASK,
  maskImage: GENERIC_RECORD_REFLECTION_MASK,
} satisfies CSSProperties;

const SINGLE_GENERIC_RECORD_REFLECTION_STYLE = {
  ...RECORD_REFLECTION_STYLE,
  WebkitMaskImage: SINGLE_GENERIC_RECORD_REFLECTION_MASK,
  maskImage: SINGLE_GENERIC_RECORD_REFLECTION_MASK,
} satisfies CSSProperties;

const GROUND_SHADOW_STYLE = {
  backgroundImage:
    "radial-gradient(ellipse at 50% 58%, rgba(0, 0, 0, 0.58) 0 34%, rgba(0, 0, 0, 0.26) 54%, transparent 73%)",
  filter: "blur(8px)",
  transform: "translateY(3.5%) scale(0.99)",
} satisfies CSSProperties;

const LABEL_STYLE = {
  boxShadow:
    "0 0 0 3px rgba(0, 0, 0, 0.9), 0 0 0 5px rgba(255, 255, 255, 0.05), inset 0 0 18px rgba(255, 255, 255, 0.15), inset 0 -22px 28px rgba(0, 0, 0, 0.24)",
} satisfies CSSProperties;

const LABEL_TEXTURE_STYLE = {
  backgroundImage:
    "radial-gradient(circle, transparent 0 10%, rgba(255, 255, 255, 0.14) 10.5% 11%, transparent 11.5%), radial-gradient(circle, transparent 0 72%, rgba(0, 0, 0, 0.18) 100%)",
} satisfies CSSProperties;

const LABEL_PRINT_STYLE = {
  background: "rgb(5, 5, 6)",
  borderRadius: "0px",
  boxShadow: "0 1px 8px rgba(0, 0, 0, 0.34)",
} satisfies CSSProperties;

const CENTER_HOLE_STYLE = {
  background: "radial-gradient(circle at 50% 50%, #070708 0 44%, #3f4142 45% 63%, #070708 64% 100%)",
  boxShadow:
    "0 0 0 1px rgba(255, 255, 255, 0.18), inset 0 1px 1px rgba(255, 255, 255, 0.18), inset 0 -1px 2px rgba(0, 0, 0, 0.8)",
} satisfies CSSProperties;

// A 7-inch 45 RPM Single has a 1.5-inch centre opening. It is a real cut-out,
// not a painted dark circle: the turntable beneath supplies the spindle or
// adapter. Percentages are relative to the radial-gradient's farthest corner,
// mapping the 10.8-unit physical radius to 15.2% in this 100×100 disc space.
const SINGLE_CENTRE_OPENING_MASK = "radial-gradient(circle at 50% 50%, transparent 0 15.2%, #000 15.5% 100%)";

const SINGLE_RECORD_SURFACE_STYLE = {
  ...RECORD_SURFACE_STYLE,
  WebkitMaskImage: SINGLE_CENTRE_OPENING_MASK,
  maskImage: SINGLE_CENTRE_OPENING_MASK,
} satisfies CSSProperties;

const SINGLE_GROUND_SHADOW_STYLE = {
  ...GROUND_SHADOW_STYLE,
  WebkitMaskImage: SINGLE_CENTRE_OPENING_MASK,
  maskImage: SINGLE_CENTRE_OPENING_MASK,
} satisfies CSSProperties;

// This image is a static rendered reference, deliberately positioned outside
// the rotor. Its baked highlights and rainbow accent remain fixed while the
// Single and its paper label rotate underneath.
const SINGLE_RPM_ADAPTER_RENDER_BORE_MASK = "radial-gradient(circle at 50% 50%, transparent 0 8.3%, #000 8.6% 100%)";

function SingleRpmAdapter() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-1/2 z-[35] aspect-square -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full"
      data-vinyl-single-rpm-adapter="true"
      style={{ width: "23.2%" }}
    >
      <img
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full max-w-none object-cover"
        data-vinyl-single-rpm-adapter-render="true"
        draggable={false}
        src="/img/vinyl/rpm-adapter-render.png"
        style={{
          WebkitMaskImage: SINGLE_RPM_ADAPTER_RENDER_BORE_MASK,
          maskImage: SINGLE_RPM_ADAPTER_RENDER_BORE_MASK,
          transform: "scale(1.4)",
        }}
      />
    </span>
  );
}

function vinylAriaLabel(labelTitle?: string | null) {
  return labelTitle ? `Vinyl record for ${labelTitle}` : "Vinyl record";
}

function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

/**
 * Z-axis rotation plus a sub-pixel `translateZ`. The non-zero Z translation is
 * deliberate: under the Web Animations API a `rotate()` (or even `rotate3d`/
 * `translateZ(0)`) resolves to a flat 2D `matrix`, which Safari and Firefox do
 * not reliably promote to a compositor layer — so the heavy label (gradients +
 * arc text) repaints every frame and the spin stutters. A non-zero `translateZ`
 * keeps the value a true `matrix3d`, forcing a stable GPU layer there. Chrome
 * composites either way. The 0.01px shift is visually inert: there is no
 * `perspective` ancestor to turn it into a scale.
 */
function rotateZ(degrees: number): string {
  return `rotate(${degrees}deg) translateZ(0.01px)`;
}

/**
 * Reads a Z rotation in degrees from any transform form the rotor can carry: the
 * inline `rotate(…deg) translateZ(…)` we write, or the `matrix()` / `matrix3d()`
 * a browser reports while a Web Animation runs. For a pure Z rotation the first
 * two matrix components are `cos`/`sin`, so the angle is `atan2(sin, cos)` for
 * both matrix forms.
 *
 * @param transform - A CSS transform string (inline style or computed).
 * @returns The rotation in degrees, or 0 when no rotation can be parsed.
 */
function rotationFromTransform(transform: string): number {
  const trimmed = transform.trim();

  const rotate = trimmed.match(/rotate\((-?\d+(?:\.\d+)?)deg\)/);
  if (rotate?.[1]) return Number(rotate[1]);

  const matrix = trimmed.match(/^matrix(?:3d)?\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?),/);
  if (!matrix?.[1] || !matrix[2]) return 0;
  return (Math.atan2(Number(matrix[2]), Number(matrix[1])) * 180) / Math.PI;
}

/**
 * Current Z rotation of the rotor in degrees, read so play/pause/coast handoffs
 * never snap the angle. The computed transform is preferred because while a Web
 * Animation runs it reflects the LIVE angle (as a matrix), whereas the inline
 * style still holds the angle written when the animation STARTED — reading that
 * would jump the rotor back to its start angle on every transition. The inline
 * style is only the fallback (SSR, or before any transform is set).
 */
function readRotationDegrees(element: HTMLElement): number {
  if (typeof window !== "undefined") {
    const computed = window.getComputedStyle(element).transform;
    if (computed && computed !== "none") return rotationFromTransform(computed);
  }
  return rotationFromTransform(element.style.transform);
}

/**
 * Arc length (in viewBox units) of the circular baseline {@link labelArcPath}
 * produces for a given radius and baseline-Y. Used to fit imprint text to the
 * available curve without `textLength`, which Safari and Firefox render
 * inconsistently on `<textPath>`.
 *
 * @param radius - Circle radius the arc is taken from.
 * @param baselineY - Y of the arc's chord endpoints (the text baseline).
 * @returns The arc length spanned between the chord endpoints.
 */
function labelArcLength(radius: number, baselineY: number) {
  const halfChord = Math.sqrt(Math.max(0, radius ** 2 - (baselineY - 50) ** 2));
  const centralAngle = 2 * Math.asin(Math.min(1, halfChord / radius));
  return radius * centralAngle;
}

/**
 * Largest font-size at which a monospace string fits within `availableWidth`,
 * capped at `maxFontSize`. Iosevka Charon Mono advances every glyph by a fixed
 * {@link LABEL_FONT_ADVANCE_EM}, so the rendered width is exactly
 * `fontSize · (advance·n + spacingRatio·(n-1))` — the fit is computed with no DOM
 * measurement (deterministic, SSR-safe) and never overflows the curve, sidestepping
 * the cross-browser `textLength` bugs on `<textPath>`.
 *
 * @param value - Text to fit; leading/trailing whitespace is ignored.
 * @param availableWidth - Target width in viewBox units (e.g. an arc length).
 * @param maxFontSize - Upper bound; shorter strings render at this size.
 * @param spacingRatio - Letter-spacing as a fraction of font-size.
 * @returns The fitted font-size in viewBox units.
 */
function fittedMonoFontSize(value: string, availableWidth: number, maxFontSize: number, spacingRatio: number) {
  const charCount = [...value.trim()].length;
  if (charCount === 0) return maxFontSize;
  const unitWidth = LABEL_FONT_ADVANCE_EM * charCount + spacingRatio * (charCount - 1);
  const fitted = Math.min(maxFontSize, availableWidth / unitWidth);
  return Math.round(fitted * 1000) / 1000;
}

/**
 * Captures the rotor's current Z rotation, stops EVERY animation on the rotor, and
 * pins that angle as the inline transform. This is the handoff every
 * play/pause/coast transition runs through so the spin continues from where it is
 * instead of snapping.
 *
 * The live animated value is flushed into the inline style with `commitStyles()`
 * BEFORE `cancel()`: cancelling a compositor animation in Firefox otherwise drops
 * the transform back to its base value for a frame (a visible angle jump) before
 * the next animation takes over. Committing first leaves the current angle in
 * place across the cancel, so the angle is always carried over.
 *
 * **Why it cancels ALL animations, not only `animationRef.current` (hard-won):**
 * the coast animation runs with `fill: forwards`. A finished fill-forwards
 * animation does NOT remove itself from the element's Web Animations stack — it
 * stays "in effect" and keeps contributing its end value to the computed
 * transform. The coast's `onfinish` clears `animationRef`, so a later handoff has
 * no reference to cancel it. Across repeated play/pause/play these orphaned coast
 * animations pile up and override every new spin, pinning the rotor to a stale
 * angle — the "rotor jumps to a random angle on repeated play/pause" bug.
 * `element.getAnimations()` is the only way to reach and cancel the orphans; it is
 * guarded with `?.()` because jsdom does not implement it.
 *
 * @param element - The rotor element carrying the spin transform.
 * @param animationRef - Mutable ref holding the active animation; cleared here.
 * @returns The preserved rotation in degrees, normalized to [0, 360).
 */
function preserveRotorRotationAndCancel(element: HTMLElement, animationRef: { current: Animation | null }) {
  const animation = animationRef.current;
  if (animation) {
    // Persist the live transform into the inline style first; without this,
    // Firefox briefly paints the base transform between cancel and the next
    // style sync. commitStyles throws if the target is unstyled/detached — that
    // is harmless, the angle is re-read from the computed transform below.
    try {
      animation.commitStyles();
    } catch {
      // ignore and fall back to reading the angle below
    }
    animation.cancel();
  }
  animationRef.current = null;
  // Safety net: cancel EVERY other animation still attached to the rotor, not
  // just the tracked one. A coast animation runs with `fill: forwards`; once it
  // finishes it lingers in the element's effect stack and keeps overriding the
  // transform, while its onfinish already cleared `animationRef` — so only a
  // blanket cancel can remove it. Without this, repeated play/pause/play leaves
  // a stack of finished coast animations pinning the rotor to a stale angle (the
  // "random" jump). `getAnimations` is guarded because jsdom does not implement it.
  for (const active of element.getAnimations?.() ?? []) active.cancel();
  const currentRotation = normalizeDegrees(readRotationDegrees(element));
  element.style.transform = rotateZ(currentRotation);
  return currentRotation;
}

/**
 * Starts (or hands off) the rotor animation for the given spin state.
 *
 * Every transition runs through {@link preserveRotorRotationAndCancel} first so
 * the angle carries over without snapping. While `Playing` the rotor loops at the
 * fixed {@link LP_PLAYING_TIMING} tempo; coast eases out and idle stops.
 *
 * @param element - The rotor element carrying the spin transform.
 * @param animationRef - Mutable ref holding the active animation.
 * @param spinState - Target spin state.
 * @param discFormat - Physical record format, which determines its playing RPM.
 */
function startRotorAnimation(
  element: HTMLElement,
  animationRef: { current: Animation | null },
  spinState: VinylSpinStateValue,
  discFormat: VinylDiscFormatValue,
) {
  if (typeof element.animate !== "function") return;

  const currentRotation = preserveRotorRotationAndCancel(element, animationRef);

  switch (spinState) {
    case VinylSpinState.Playing:
      animationRef.current = element.animate(
        [{ transform: rotateZ(currentRotation) }, { transform: rotateZ(currentRotation + 360) }],
        PLAYING_ROTATION_TIMING[discFormat],
      );
      return;
    case VinylSpinState.Coasting: {
      const finishRotation = currentRotation + LP_COAST_DEGREES;
      const animation = element.animate(
        [{ transform: rotateZ(currentRotation) }, { transform: rotateZ(finishRotation) }],
        LP_COAST_TIMING,
      );
      animation.onfinish = () => {
        // Pin the final angle as the inline transform, THEN cancel — a finished
        // `fill: forwards` animation otherwise lingers in the element's effect
        // stack and overrides the next spin's transform (the rotor jump bug).
        element.style.transform = rotateZ(normalizeDegrees(finishRotation));
        animation.cancel();
        if (animationRef.current === animation) animationRef.current = null;
      };
      animationRef.current = animation;
      return;
    }
    case VinylSpinState.Idle:
      return;
  }
}

export function VinylRecord({
  className,
  discFormat,
  labelArtworkUrl,
  labelCatalogText,
  labelRightsText,
  labelSubtitle,
  labelTitle,
  labelYear,
  labelVariant,
  showTurntableSpindle = true,
  sideLayout,
  spinState = VinylSpinState.Idle,
}: VinylRecordProps) {
  const resolvedLabelVariant =
    labelVariant ?? (labelArtworkUrl ? VinylLabelVariant.Standard : VinylLabelVariant.Generic);
  const usesGenericLabel = resolvedLabelVariant === VinylLabelVariant.Generic;
  const hasSingleCentreOpening = discFormat === VinylDiscFormat.Single;
  const displayTitle = labelTitle ?? DEFAULT_LABEL_TITLE;
  const displayRights = labelRightsText ?? DEFAULT_LABEL_RIGHTS_TEXT;
  // The center catalog field falls back to a placeholder only for commercial
  // tracks; CC tracks have no ISRC, so the middle stays empty (the licence sits
  // in the top-left rights field instead).
  const displayCatalog =
    labelCatalogText ?? (displayRights === DEFAULT_LABEL_RIGHTS_TEXT ? DEFAULT_LABEL_CATALOG_TEXT : "");
  const legalText = `${labelYear ? `P ${labelYear}` : DEFAULT_LABEL_SPEED} · 33 1/3 RPM · PRODUCED BY MUSICCLOUD`;
  const titleFontSize = fittedMonoFontSize(
    displayTitle,
    LABEL_TITLE_ARC_LENGTH * LABEL_TITLE_ARC_FILL,
    LABEL_TITLE_MAX_FONT_SIZE,
    LABEL_TITLE_LETTER_SPACING_RATIO,
  );
  const subtitleFontSize = fittedMonoFontSize(
    labelSubtitle ?? "",
    LABEL_SUBTITLE_MAX_WIDTH,
    LABEL_SUBTITLE_MAX_FONT_SIZE,
    LABEL_SUBTITLE_LETTER_SPACING_RATIO,
  );
  const labelPathId = `vinyl${useId().replaceAll(":", "")}`;
  const titleArcId = `${labelPathId}-title`;
  const legalArcId = `${labelPathId}-legal`;
  const grooveImageSrc = useMemo(() => {
    if (!sideLayout) return VINYL_GROOVE_IMAGE_SRC;
    const grooveLayout = vinylSideGrooveLayout(sideLayout, {
      innerRadius: VINYL_GROOVE_INNER_RADIUS,
      outerRadius: VINYL_GROOVE_OUTER_RADIUS,
      turns: VINYL_GROOVE_TURNS,
    });
    return vinylGrooveImageSrc(grooveLayout.path, grooveLayout.darkBands);
  }, [sideLayout]);
  const sideLetter = sideLayout?.label ?? "A";
  const labelInset = sideLayout ? DISCOGS_LABEL_INSET : VINYL_LABEL_INSET[discFormat];
  const rotorRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<Animation | null>(null);

  useEffect(() => {
    const rotor = rotorRef.current;
    if (!rotor) return;

    startRotorAnimation(rotor, animationRef, spinState, discFormat);

    return () => {
      preserveRotorRotationAndCancel(rotor, animationRef);
    };
  }, [discFormat, spinState]);

  return (
    // The vinyl is a composite image: role="img" + aria-label name the whole
    // disc for assistive tech. It lives on a <figure> (a non-generic element),
    // not a <div>, so react-doctor's prefer-tag-over-role does not flag it — that
    // rule only fires on role-bearing generic tags, and no single HTML tag can
    // represent an image assembled from child layers. m-0 drops the UA figure
    // margin.
    <figure
      aria-label={vinylAriaLabel(labelTitle)}
      className={cn("relative m-0 aspect-square overflow-visible rounded-full transform-gpu", className)}
      data-vinyl-disc-format={discFormat}
      data-vinyl-label-variant={resolvedLabelVariant}
      data-spin-state={spinState}
      role="img"
    >
      <span
        aria-hidden="true"
        className="absolute inset-[1.5%] z-0 rounded-full"
        data-vinyl-ground-shadow="true"
        style={hasSingleCentreOpening ? SINGLE_GROUND_SHADOW_STYLE : GROUND_SHADOW_STYLE}
      />
      {/* The base record surface (radial shade, spindle ring, rim) stays STATIC:
          it is radially symmetric, so its rotation would be imperceptible, and
          keeping it out of the rotor means it is never repainted per frame. */}
      <div
        className="relative z-10 h-full w-full overflow-hidden rounded-full"
        data-vinyl-surface="true"
        data-vinyl-single-centre-opening={hasSingleCentreOpening ? "true" : undefined}
        style={hasSingleCentreOpening ? SINGLE_RECORD_SURFACE_STYLE : RECORD_SURFACE_STYLE}
      >
        <span aria-hidden="true" className="absolute inset-0 rounded-full" style={RECORD_EDGE_STYLE} />
        {/* The groove spiral and the label rotate together so the groove visibly
            spins. The spiral is a rasterised <img> bitmap, so the rotor composites
            as one cached GPU layer instead of re-rasterising a heavy vector path
            each frame; the base shade and rim stay static. */}
        <div
          // will-change is toggled with the spin state, not left on permanently:
          // it hints a compositor layer only while the rotor actually animates
          // (playing/coasting) and drops it at rest, so an idle deck — the common
          // case on a share page before play — holds no standing GPU layer. The
          // transitions are user-driven (play/pause), never per-frame, so this is
          // the recommended "promote just before animating" usage, not churn.
          className={cn(
            "absolute inset-0 z-10 rounded-full transform-gpu",
            spinState !== VinylSpinState.Idle && "will-change-transform",
          )}
          data-vinyl-rotor="true"
          ref={rotorRef}
        >
          <img
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full"
            data-vinyl-grooves="true"
            draggable={false}
            src={grooveImageSrc}
          />
          <span aria-hidden="true" className="absolute inset-[2.8%] rounded-full" style={RECORD_DETAIL_STYLE} />
          <div
            className="absolute z-20 overflow-hidden rounded-full"
            data-vinyl-label="true"
            data-vinyl-label-variant={resolvedLabelVariant}
            style={{ ...LABEL_STYLE, inset: labelInset }}
          >
            {usesGenericLabel ? (
              <GenericVinylLabel
                hasSingleCentreOpening={hasSingleCentreOpening}
                idPrefix={labelPathId}
                sideLetter={sideLetter}
              />
            ) : (
              <>
                {labelArtworkUrl ? (
                  <img
                    alt=""
                    className="absolute left-1/2 top-1/2 h-[112%] w-[112%] max-w-none -translate-x-1/2 -translate-y-1/2 object-cover"
                    data-vinyl-label-artwork="true"
                    draggable={false}
                    src={labelArtworkUrl}
                  />
                ) : null}
                {!labelArtworkUrl && <span aria-hidden="true" className="absolute inset-0 rounded-full bg-black/30" />}
                <span aria-hidden="true" className="absolute inset-0 rounded-full" style={LABEL_TEXTURE_STYLE} />
                <div
                  aria-hidden="true"
                  className="absolute right-0 bottom-0 left-0 z-20 h-[43%]"
                  data-vinyl-label-print="true"
                  style={LABEL_PRINT_STYLE}
                />
                <svg
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 z-30 h-full w-full"
                  data-vinyl-label-print-copy="true"
                  viewBox="0 0 100 100"
                >
                  <defs>
                    <path d={LABEL_TITLE_ARC_PATH} data-vinyl-label-title-path="true" id={titleArcId} />
                    <path d={LABEL_LEGAL_ARC_PATH} data-vinyl-label-legal-path="true" id={legalArcId} />
                  </defs>
                  <VinylLabelPressingCopy
                    catalogText={displayCatalog}
                    rightsText={displayRights}
                    sideLetter={sideLetter}
                  />
                  <text
                    className="uppercase"
                    data-vinyl-label-title="true"
                    fill="rgba(255, 255, 255, 0.94)"
                    fontSize={titleFontSize}
                    fontWeight="700"
                    letterSpacing={titleFontSize * LABEL_TITLE_LETTER_SPACING_RATIO}
                    style={VINYL_LABEL_TEXT_STYLE}
                  >
                    <textPath
                      data-vinyl-label-title-arc="true"
                      href={`#${titleArcId}`}
                      startOffset="50%"
                      textAnchor="middle"
                    >
                      {displayTitle}
                    </textPath>
                  </text>
                  {labelSubtitle ? (
                    <text
                      className="uppercase"
                      data-vinyl-label-subtitle="true"
                      fill="rgba(255, 255, 255, 0.66)"
                      fontSize={subtitleFontSize}
                      fontWeight="400"
                      letterSpacing={subtitleFontSize * LABEL_SUBTITLE_LETTER_SPACING_RATIO}
                      style={VINYL_LABEL_TEXT_STYLE}
                      textAnchor="middle"
                      x="50"
                      y="84"
                    >
                      {labelSubtitle}
                    </text>
                  ) : null}
                  <text
                    fill="rgba(255, 255, 255, 0.58)"
                    fontSize={LABEL_LEGAL_FONT_SIZE}
                    fontWeight="300"
                    letterSpacing={LABEL_LEGAL_LETTER_SPACING}
                    style={VINYL_LABEL_TEXT_STYLE}
                  >
                    <textPath href={`#${legalArcId}`} startOffset="50%" textAnchor="middle">
                      {legalText}
                    </textPath>
                  </text>
                </svg>
              </>
            )}
            <span className="sr-only">SIDE {sideLetter}</span>
            <span className="sr-only">{labelYear ?? DEFAULT_LABEL_SPEED}</span>
            {!hasSingleCentreOpening ? (
              <div
                aria-hidden="true"
                className="absolute left-1/2 top-1/2 z-30 aspect-square w-[8%] -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={CENTER_HOLE_STYLE}
              />
            ) : null}
          </div>
        </div>
      </div>
      {showTurntableSpindle ? (
        <TurntableSpindle className="z-[34]" placement={TurntableSpindlePlacement.Record} style={{ width: "3.7%" }} />
      ) : null}
      {hasSingleCentreOpening ? <SingleRpmAdapter /> : null}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-30 rounded-full"
        data-vinyl-reflection="true"
        style={
          sideLayout
            ? RECORD_REFLECTION_STYLE
            : discFormat === VinylDiscFormat.Single
              ? SINGLE_GENERIC_RECORD_REFLECTION_STYLE
              : GENERIC_RECORD_REFLECTION_STYLE
        }
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-40 rounded-full ring-1 ring-black/80" />
    </figure>
  );
}
