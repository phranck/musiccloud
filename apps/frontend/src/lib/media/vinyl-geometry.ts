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
