/**
 * @file What the usage chart is, without drawing it.
 *
 * The shapes and the class names live apart from the component so a consumer
 * can name a step width or paint a part without pulling the charting library
 * in with it.
 */

/** How wide one step of the series is, which decides how a time is labelled. */
export const UsageChartBucket = {
  Hour: "hour",
  Day: "day",
} as const;

/** A {@link UsageChartBucket} member value. */
export type UsageChartBucketValue = (typeof UsageChartBucket)[keyof typeof UsageChartBucket];

/** One step of the series. */
export interface UsageChartPoint {
  /** The moment the step begins, as an ISO timestamp. */
  startedAt: string;
  /** How many requests fall inside it. */
  total: number;
}

/**
 * The class names the chart puts on its parts.
 *
 * Every paint is bound in CSS rather than passed in as a value. A custom
 * property is substituted inside a style declaration, and the portal and the
 * dashboard name their colours differently, so each app writes a few rules
 * against these names using its own tokens and the chart names no colour.
 */
export const UsageChartClass = {
  Root: "mc-usage-chart",
  Bar: "mc-usage-chart__bar",
  Axis: "mc-usage-chart__axis",
  Grid: "mc-usage-chart__grid",
  Tick: "mc-usage-chart__tick",
  Tooltip: "mc-usage-chart__tooltip",
  Cursor: "mc-usage-chart__cursor",
} as const;

/** Props for the usage chart. */
export interface UsageChartProps {
  /** The steps, in order. Steps with no traffic may be absent. */
  points: UsageChartPoint[];
  /** The step width, which decides whether a tick reads as a time or a date. */
  bucket: UsageChartBucketValue;
  /** What the chart shows, for a reader who cannot see it. */
  label: string;
  /** Drawing height in pixels. */
  height?: number;
}
