import { lazy, Suspense } from "react";
import { loadUsageChartFigure } from "./loadUsageChartFigure.js";
import { USAGE_CHART_DEFAULT_HEIGHT, UsageChartClass, type UsageChartProps } from "./usageChartContract.js";

/** The drawing half, loaded when a chart is first rendered. */
const UsageChartFigure = lazy(loadUsageChartFigure);

/**
 * A bar chart of a value over time, such as API requests or income, drawn as
 * one bar per step or stacked by series.
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
      fallback={
        <div
          className={UsageChartClass.Root}
          style={{ height: props.height ?? USAGE_CHART_DEFAULT_HEIGHT }}
          aria-hidden="true"
        />
      }
    >
      <UsageChartFigure {...props} />
    </Suspense>
  );
}
