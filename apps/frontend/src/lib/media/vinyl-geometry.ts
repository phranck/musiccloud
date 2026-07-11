import type { VinylSide } from "@musiccloud/shared";

const SIDE_GROOVE_RUN_IN_BAND_WIDTH = 1.5;
const SIDE_GROOVE_RUN_OUT_BAND_WIDTH = 1.5;
const SIDE_GROOVE_SEGMENT_LENGTH = 1.6;
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
 * on the 100×100 viewBox — one continuous groove from the outer edge inward, the
 * way a real record is cut, instead of separate concentric rings.
 *
 * Sampled at a constant **arc length** rather than a fixed number of points per
 * turn: a fixed per-turn count leaves visible polygon corners on the long outer
 * windings while over-sampling the short inner ones. Walking from the outer edge
 * inward with `cos(θ)`/`sin(θ)` and a decreasing angle makes the groove run
 * counter-clockwise from outside to inside (SVG's y-axis points down).
 *
 * @param turns - Number of revolutions between inner and outer radius.
 * @param innerRadius - Where the groove ends (near the label edge).
 * @param outerRadius - Where the groove starts (near the record rim).
 * @returns The `d` attribute for a `<path>`.
 */
export function vinylGrooveSpiralPath(turns: number, innerRadius: number, outerRadius: number): string {
  // ~1.6 viewBox units between samples keeps the curve smooth at the displayed
  // size while keeping the path string small (it ships in the DOM and is
  // re-rasterised per frame on software-rendered Firefox). 1-decimal coordinates
  // are precise enough at this scale and roughly halve the string length.
  const segmentLength = 1.6;
  const totalAngle = turns * 2 * Math.PI;
  const growthPerRadian = (outerRadius - innerRadius) / totalAngle;
  const points: string[] = [];
  let theta = totalAngle;
  let isFirst = true;
  while (theta > 0) {
    const radius = innerRadius + growthPerRadian * theta;
    const x = 50 + radius * Math.cos(theta);
    const y = 50 + radius * Math.sin(theta);
    points.push(`${isFirst ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`);
    isFirst = false;
    theta -= segmentLength / radius;
  }
  points.push(`L ${(50 + innerRadius).toFixed(1)} 50`);
  return points.join(" ");
}

function vinylGrooveSegmentPath(
  startRadius: number,
  endRadius: number,
  startAngle: number,
  turnsPerRadius: number,
): string {
  const radialDistance = startRadius - endRadius;
  const turns = radialDistance * turnsPerRadius;
  const endAngle = startAngle - turns * 2 * Math.PI;
  const points: string[] = [];
  let radius = startRadius;
  let angle = startAngle;
  let isFirst = true;

  while (angle > endAngle) {
    const x = 50 + radius * Math.cos(angle);
    const y = 50 + radius * Math.sin(angle);
    points.push(`${isFirst ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`);
    isFirst = false;
    const angleStep = SIDE_GROOVE_SEGMENT_LENGTH / radius;
    angle -= angleStep;
    radius = Math.max(endRadius, startRadius - ((startAngle - angle) / (turns * 2 * Math.PI)) * radialDistance);
  }

  points.push(
    `L ${(50 + endRadius * Math.cos(endAngle)).toFixed(1)} ${(50 + endRadius * Math.sin(endAngle)).toFixed(1)}`,
  );
  return points.join(" ");
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
