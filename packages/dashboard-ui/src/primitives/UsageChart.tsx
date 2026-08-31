import { lazy, Suspense } from "react";
import { UsageChartClass, type UsageChartProps } from "./usageChartContract.js";

/**
 * The drawing half, loaded when a chart is actually rendered.
 *
 * The charting library is the heaviest thing either app depends on, and most
 * screens draw nothing. Splitting it here keeps it out of every bundle that
 * merely imports something else from this package.
 */
const UsageChartFigure = lazy(() => import("./UsageChartFigure.js"));

/**
 * A bar chart of API requests over time.
 *
 * The placeholder holds the chart's height whilst the library arrives, so the
 * page does not jump when it does.
 *
 * @param props - See `UsageChartProps`.
 * @returns The chart, described for a screen reader by its label.
 */
export function UsageChart(props: UsageChartProps) {
  return (
    <Suspense
      fallback={<div className={UsageChartClass.Root} style={{ height: props.height ?? 180 }} aria-hidden="true" />}
    >
      <UsageChartFigure {...props} />
    </Suspense>
  );
}
