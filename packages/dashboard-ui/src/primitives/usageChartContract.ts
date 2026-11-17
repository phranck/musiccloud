/**
 * @file What the usage chart is, without drawing it.
 *
 * The shapes and the class names live apart from the component so a consumer
 * can name a step width or paint a part without pulling the charting library
 * in with it.
 */

/**
 * How wide one step of the series is, which decides how a time is labelled.
 *
 * - `Hour`: ticks read as a time of day, the tooltip as day and time.
 * - `Day`: ticks read as a date, the tooltip as day and time.
 * - `Month`: ticks read as month and year, the tooltip as the full month. A
 *   month is read in UTC, so a step starting on the first of a month stays in
 *   that month in every time zone.
 */
export const UsageChartBucket = {
  Hour: "hour",
  Day: "day",
  Month: "month",
} as const;

/** A {@link UsageChartBucket} member value. */
export type UsageChartBucketValue = (typeof UsageChartBucket)[keyof typeof UsageChartBucket];

/** The drawing height in pixels when a caller names none: 180. */
export const USAGE_CHART_DEFAULT_HEIGHT = 180;

/** The tooltip's name for a value when the chart draws one unnamed series: `"Requests"`. */
export const USAGE_CHART_DEFAULT_VALUE_LABEL = "Requests";

/** One step of the series. */
export interface UsageChartPoint {
  /** The moment the step begins, as an ISO timestamp. */
  startedAt: string;
  /** The step's whole value, such as how many requests fall inside it. */
  total: number;
  /**
   * The step's value per series, keyed by {@link UsageChartSeries.key}. Read
   * only when the chart is given `series`; a key missing here counts as zero.
   */
  parts?: Readonly<Record<string, number>>;
}

/** One series of a stacked chart. */
export interface UsageChartSeries {
  /** The key the series' value carries in {@link UsageChartPoint.parts}. */
  key: string;
  /** What the legend and the tooltip call it. */
  label: string;
}

/**
 * The class names the chart puts on its parts.
 *
 * Every paint is bound in CSS rather than passed in as a value. A custom
 * property is substituted inside a style declaration, and the portal and the
 * dashboard name their colours differently, so each app writes a few rules
 * against these names using its own tokens and the chart names no colour.
 *
 * A stacked series carries `Series` and its numbered modifier from
 * {@link usageChartSeriesClass}, on its bars and on its legend swatch alike,
 * so one rule per number colours both.
 */
export const UsageChartClass = {
  Root: "mc-usage-chart",
  Bar: "mc-usage-chart__bar",
  Series: "mc-usage-chart__series",
  Legend: "mc-usage-chart__legend",
  Swatch: "mc-usage-chart__swatch",
  Axis: "mc-usage-chart__axis",
  Grid: "mc-usage-chart__grid",
  Tick: "mc-usage-chart__tick",
  Tooltip: "mc-usage-chart__tooltip",
  Cursor: "mc-usage-chart__cursor",
} as const;

/**
 * The classes of the series at a position in `series`.
 *
 * @param index - The series' position, from zero.
 * @returns `Series` and its modifier counted from one, such as
 *   `"mc-usage-chart__series mc-usage-chart__series--1"` for the first.
 */
export function usageChartSeriesClass(index: number): string {
  return `${UsageChartClass.Series} ${UsageChartClass.Series}--${index + 1}`;
}

/** Props for the usage chart. */
export interface UsageChartProps {
  /** The steps, in order. Steps with no value may be absent. */
  points: UsageChartPoint[];
  /** The step width, which decides how a tick and the tooltip read a time. */
  bucket: UsageChartBucketValue;
  /** What the chart shows, for a reader who cannot see it. */
  label: string;
  /** Drawing height in pixels, {@link USAGE_CHART_DEFAULT_HEIGHT} when absent. */
  height?: number;
  /**
   * The series to stack, bottom first. When present, each step draws one
   * segment per series from {@link UsageChartPoint.parts} and the chart shows
   * a legend; when absent, it draws one bar per step from `total`.
   */
  series?: readonly UsageChartSeries[];
  /**
   * Writes a value for the axis and the tooltip. A whole count with grouped
   * thousands when absent; a money chart passes its currency format here.
   */
  formatValue?: (value: number) => string;
  /**
   * The tooltip's name for the value of an unstacked chart,
   * {@link USAGE_CHART_DEFAULT_VALUE_LABEL} when absent. A stacked chart names
   * each value by its series instead.
   */
  valueLabel?: string;
}
