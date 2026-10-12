/**
 * Loads the chart's drawing half, which carries the charting library.
 *
 * The charting library is the heaviest thing either app depends on, and most
 * screens draw nothing. Splitting it here keeps it out of every bundle that
 * merely imports something else from this package. `UsageChart` loads it
 * through this function when a chart is first rendered, and a caller that
 * wants it ready earlier calls it too, so both share one import.
 *
 * @returns The module whose default export draws the chart.
 */
export function loadUsageChartFigure() {
  return import("./UsageChartFigure.js");
}
