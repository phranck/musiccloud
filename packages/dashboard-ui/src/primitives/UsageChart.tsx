import { lazy, Suspense } from "react";
import { loadUsageChartFigure } from "./loadUsageChartFigure.js";
import { UsageChartClass, type UsageChartProps } from "./usageChartContract.js";

/** The drawing half, loaded when a chart is first rendered. */
const UsageChartFigure = lazy(loadUsageChartFigure);

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
