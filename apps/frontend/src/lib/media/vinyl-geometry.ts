import type { VinylSide } from "@musiccloud/shared";

const SIDE_GROOVE_RUN_IN_BAND_WIDTH = 1.5;
const SIDE_GROOVE_RUN_OUT_BAND_WIDTH = 1.5;
const SIDE_GROOVE_PAUSE_BAND_WIDTH = 1;

/**
 * The record radii available to a per-side groove path.
 */
export interface VinylSideGroovePathOptions {
  /** Where the final run-out groove ends, near the label edge. */
  innerRadius: number;
  /** Where the outer run-in groove begins, near the record rim. */
  outerRadius: number;
  /** Number of groove revolutions across the complete playable radius. */
  turns: number;
}

/** A dark, groove-free annular zone on a vinyl side. */
export interface VinylSideDarkBand {
  /** Centre radius of the annular zone in the 100×100 SVG viewBox. */
  radius: number;
  /** Radial width of the annular zone in viewBox units. */
  width: number;
}

/** Complete geometry for one Discogs-derived vinyl side. */
export interface VinylSideGrooveLayout {
  /** Fine spiral and single locked pause-groove paths. */
  path: string;
  /** Darker, widely spaced lead-in, lead-out and pause zones. */
  darkBands: VinylSideDarkBand[];
}

/**
 * Formats an SVG arc coordinate without a redundant decimal suffix.
 *
 * @param value - Coordinate value in the 100×100 viewBox.
 * @returns The coordinate formatted with at most one decimal place.
 */
function formatArcCoordinate(value: number) {
  return value.toFixed(1).replace(/\.0$/, "");
}

/**
 * Builds a circular SVG arc path centred on the 100×100 viewBox.
 *
 * @param radius - Circle radius the arc is taken from.
 * @param baselineY - Y of the arc's chord endpoints (the text baseline).
 * @returns The `d` attribute for an SVG `<path>`.
 */
export function labelArcPath(radius: number, baselineY: number) {
  const verticalOffset = baselineY - 50;
  const halfChord = Math.sqrt(Math.max(0, radius ** 2 - verticalOffset ** 2));
  const startX = formatArcCoordinate(50 - halfChord);
  const endX = formatArcCoordinate(50 + halfChord);

  return `M ${startX} ${formatArcCoordinate(baselineY)} A ${radius} ${radius} 0 0 0 ${endX} ${formatArcCoordinate(baselineY)}`;
}

/**
 * Builds an Archimedean spiral as an SVG path (`r = innerRadius + b·θ`), centred
 * on the 100×100 viewBox. It is one continuous groove from the outer edge
 * inward, the way a real record is cut, instead of separate concentric rings.
 * The groove runs counter-clockwise from outside to inside and is drawn as
 * quarter-turn arcs, see {@link spiralArcPath}.
 *
 * @param turns - Number of revolutions between inner and outer radius.
 * @param innerRadius - Where the groove ends (near the label edge).
 * @param outerRadius - Where the groove starts (near the record rim).
 * @returns The `d` attribute for a `<path>`.
 */
export function vinylGrooveSpiralPath(turns: number, innerRadius: number, outerRadius: number): string {
  return spiralArcPath(outerRadius, innerRadius, turns * 2 * Math.PI, 0);
}

/**
 * Angle one arc command of a spiral path covers: a quarter turn. Over a quarter
 * turn the groove's radius changes by under a tenth of a viewBox unit, so a
 * circular arc through both ends stays within a fraction of the stroke width of
 * the true spiral, and a 72-turn groove needs 288 commands instead of the
 * thousands of straight segments a polyline needs to look round.
 */
const SPIRAL_ARC_STEP_RADIANS = Math.PI / 2;

/** Rounding slack when counting arc steps, far below one step. */
const SPIRAL_STEP_TOLERANCE = 1e-9;

/**
 * Formats a spiral coordinate. Two decimals keep consecutive arcs meeting
 * without a visible kink at the record's largest display size.
 */
function formatSpiralCoordinate(value: number): string {
  return value.toFixed(2);
}

/**
 * Builds part of an Archimedean spiral centred on the 100×100 viewBox as
 * circular arcs, walking from `startAngle` down to `endAngle` while the radius
 * moves linearly from `startRadius` to `endRadius`. A decreasing angle with
 * `cos`/`sin` makes the groove run counter-clockwise on screen (SVG's y-axis
 * points down), which is the arcs' sweep flag 0.
 *
 * The path ships inside a data URL on every share page and is rasterised when a
 * record appears, so its size and its number of segments are what the record's
 * first frame costs.
 *
 * @param startRadius - Radius at `startAngle`.
 * @param endRadius - Radius at `endAngle`.
 * @param startAngle - Angle the groove starts at, in radians.
 * @param endAngle - Angle the groove ends at, in radians; not above `startAngle`.
 * @returns The `d` attribute for a `<path>`.
 */
function spiralArcPath(startRadius: number, endRadius: number, startAngle: number, endAngle: number): string {
  const totalAngle = startAngle - endAngle;
  const radiusAt = (angle: number) =>
    totalAngle > 0 ? startRadius + ((startAngle - angle) / totalAngle) * (endRadius - startRadius) : endRadius;
  const pointAt = (radius: number, angle: number) =>
    `${formatSpiralCoordinate(50 + radius * Math.cos(angle))} ${formatSpiralCoordinate(50 + radius * Math.sin(angle))}`;

  // Each step's angle comes from its index rather than from repeated
  // subtraction, which would leave a sliver of an extra arc at the end.
  const stepCount = Math.ceil(totalAngle / SPIRAL_ARC_STEP_RADIANS - SPIRAL_STEP_TOLERANCE);
  const commands = [`M ${pointAt(startRadius, startAngle)}`];
  let radius = startRadius;
  for (let step = 1; step <= stepCount; step++) {
    const nextAngle = startAngle - Math.min(totalAngle, step * SPIRAL_ARC_STEP_RADIANS);
    const nextRadius = radiusAt(nextAngle);
    const arcRadius = formatSpiralCoordinate((radius + nextRadius) / 2);
    commands.push(`A ${arcRadius} ${arcRadius} 0 0 0 ${pointAt(nextRadius, nextAngle)}`);
    radius = nextRadius;
  }
  return commands.join(" ");
}

function vinylGrooveSegmentPath(
  startRadius: number,
  endRadius: number,
  startAngle: number,
  turnsPerRadius: number,
): string {
  const turns = (startRadius - endRadius) * turnsPerRadius;
  return spiralArcPath(startRadius, endRadius, startAngle, startAngle - turns * 2 * Math.PI);
}

function vinylPauseGroovePath(radius: number): string {
  const topY = 50 - radius;
  const bottomY = 50 + radius;
  return `M 50 ${topY.toFixed(1)} A ${radius.toFixed(1)} ${radius.toFixed(1)} 0 1 1 50 ${bottomY.toFixed(1)} A ${radius.toFixed(1)} ${radius.toFixed(1)} 0 1 1 50 ${topY.toFixed(1)}`;
}

/**
 * Builds a deterministic SVG groove path for one vinyl side. The returned path
 * is composed of ordered subpaths: run-in, one time-proportional subpath per
 * track, one circular pause groove centred in a radial gap per track boundary,
 * then run-out. This
 * keeps every pause groove explicitly countable in the SVG data while the
 * audible track band maps its radii linearly to track durations.
 *
 * @param side - The Discogs-normalized vinyl side, ordered from outer to inner groove.
 * @param options - The inner and outer record radii in the 100×100 SVG viewBox.
 * @returns The `d` attribute for a per-side SVG `<path>`.
 */
export function vinylSideGrooveLayout(side: VinylSide, options: VinylSideGroovePathOptions): VinylSideGrooveLayout {
  const { innerRadius, outerRadius, turns } = options;
  const hasValidTiming =
    side.tracks.length > 0 && side.tracks.every((track) => Number.isFinite(track.durationMs) && track.durationMs > 0);
  if (!hasValidTiming) {
    return { path: vinylGrooveSpiralPath(turns, innerRadius, outerRadius), darkBands: [] };
  }

  const turnsPerRadius = turns / (outerRadius - innerRadius);
  const trackOuterRadius = outerRadius - SIDE_GROOVE_RUN_IN_BAND_WIDTH;
  const trackInnerRadius = innerRadius + SIDE_GROOVE_RUN_OUT_BAND_WIDTH;
  const totalDurationMs = side.tracks.reduce((total, track) => total + track.durationMs, 0);
  const trackBandWidth = trackOuterRadius - trackInnerRadius;
  const boundaryCount = Math.max(0, side.tracks.length - 1);
  const pauseBandWidth = Math.min(
    SIDE_GROOVE_PAUSE_BAND_WIDTH,
    boundaryCount === 0 ? 0 : trackBandWidth / boundaryCount,
  );
  const playableTrackBandWidth = trackBandWidth - boundaryCount * pauseBandWidth;
  const paths = [vinylGrooveSegmentPath(outerRadius, trackOuterRadius, 0, turnsPerRadius)];
  const darkBands: VinylSideDarkBand[] = [
    { radius: outerRadius - SIDE_GROOVE_RUN_IN_BAND_WIDTH / 2, width: SIDE_GROOVE_RUN_IN_BAND_WIDTH },
  ];
  let currentTrackOuterRadius = trackOuterRadius;

  for (const [index, track] of side.tracks.entries()) {
    const trackWidth = (track.durationMs / totalDurationMs) * playableTrackBandWidth;
    const trackEndRadius = currentTrackOuterRadius - trackWidth;
    const startAngle = (outerRadius - currentTrackOuterRadius) * turnsPerRadius * 2 * Math.PI;

    paths.push(vinylGrooveSegmentPath(currentTrackOuterRadius, trackEndRadius, startAngle, turnsPerRadius));
    if (index < side.tracks.length - 1) {
      const pauseRadius = trackEndRadius - pauseBandWidth / 2;
      paths.push(vinylPauseGroovePath(pauseRadius));
      darkBands.push({ radius: pauseRadius, width: pauseBandWidth });
      currentTrackOuterRadius = trackEndRadius - pauseBandWidth;
    }
  }

  const runOutStartAngle = (outerRadius - trackInnerRadius) * turnsPerRadius * 2 * Math.PI;
  paths.push(vinylGrooveSegmentPath(trackInnerRadius, innerRadius, runOutStartAngle, turnsPerRadius));
  darkBands.push({ radius: innerRadius + SIDE_GROOVE_RUN_OUT_BAND_WIDTH / 2, width: SIDE_GROOVE_RUN_OUT_BAND_WIDTH });
  return { path: paths.join(" "), darkBands };
}

/**
 * Builds the fine groove paths for a Discogs-derived vinyl side.
 *
 * @param side - The normalized Discogs side.
 * @param options - The inner and outer record radii in the 100×100 SVG viewBox.
 * @returns The SVG `d` attribute for the fine groove paths.
 */
export function vinylSideGroovePath(side: VinylSide, options: VinylSideGroovePathOptions): string {
  return vinylSideGrooveLayout(side, options).path;
}

/**
 * Builds the darker lead-in, lead-out and pause zones for a Discogs-derived side.
 *
 * @param side - The normalized Discogs side.
 * @param options - The inner and outer record radii in the 100×100 SVG viewBox.
 * @returns The annular zones that are deliberately more widely spaced than songs.
 */
export function vinylSideDarkBands(side: VinylSide, options: VinylSideGroovePathOptions): VinylSideDarkBand[] {
  return vinylSideGrooveLayout(side, options).darkBands;
}
