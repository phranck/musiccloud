import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  USAGE_CHART_DEFAULT_HEIGHT,
  USAGE_CHART_DEFAULT_VALUE_LABEL,
  UsageChartBucket,
  type UsageChartBucketValue,
  UsageChartClass,
  type UsageChartPoint,
  type UsageChartProps,
  usageChartSeriesClass,
} from "./usageChartContract.js";

/** Formatters are built once, because a tick formatter runs per tick on every resize. */
const HOUR_FORMAT = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" });
const FULL_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
/** A month step begins at midnight UTC on the first, so it is read in UTC to stay in its month everywhere. */
const MONTH_FORMAT = new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
const MONTH_FULL_FORMAT = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const COUNT_FORMAT = new Intl.NumberFormat("en-GB");

/** How a tick reads a step's start, per step width. */
const TICK_FORMAT: Record<UsageChartBucketValue, Intl.DateTimeFormat> = {
  [UsageChartBucket.Hour]: HOUR_FORMAT,
  [UsageChartBucket.Day]: DAY_FORMAT,
  [UsageChartBucket.Month]: MONTH_FORMAT,
};

/** How the tooltip reads a step's start, per step width. */
const TOOLTIP_FORMAT: Record<UsageChartBucketValue, Intl.DateTimeFormat> = {
  [UsageChartBucket.Hour]: FULL_FORMAT,
  [UsageChartBucket.Day]: FULL_FORMAT,
  [UsageChartBucket.Month]: MONTH_FULL_FORMAT,
};

/** The value axis' width in pixels for whole counts, which stay short: 40. */
const COUNT_AXIS_WIDTH = 40;

/** The value axis' width in pixels for a caller's own format, such as an amount with its currency sign: 64. */
const FORMATTED_AXIS_WIDTH = 64;

/** The stack every series of a stacked chart joins. */
const STACK_ID = "series";

/**
 * Writes a whole count with grouped thousands, the default value format.
 *
 * @param value - The count.
 * @returns The count as text, such as `"1,200"`.
 */
function formatCount(value: number): string {
  return COUNT_FORMAT.format(value);
}

/** One step as the chart draws it: the point and its start in milliseconds. */
type ChartRow = UsageChartPoint & { at: number };

/**
 * The drawing half of the usage chart.
 *
 * It is a module of its own so `UsageChart` can load it on demand: everything
 * that imports the chart's shapes or its class names would otherwise pull the
 * charting library along with them.
 *
 * The axes, the grid and the tooltip are the point of it. A shape alone says a
 * project was busier on Tuesday; a reader wants to know how much busier and at
 * what hour, and the tooltip carries the exact figure with the moment it
 * belongs to. A stacked chart adds a legend under the drawing, because the
 * colours alone do not say which series is which.
 *
 * Each series reads its value through a function rather than a field name, so
 * a series key can never collide with a field of the point itself.
 *
 * @param props - See `UsageChartProps`.
 * @returns The chart, described for a screen reader by its label.
 */
export default function UsageChartFigure({
  points,
  bucket,
  label,
  height = USAGE_CHART_DEFAULT_HEIGHT,
  series,
  formatValue = formatCount,
  valueLabel = USAGE_CHART_DEFAULT_VALUE_LABEL,
}: UsageChartProps) {
  const data = useMemo<ChartRow[]>(
    () => points.map((point) => ({ ...point, at: Date.parse(point.startedAt) })),
    [points],
  );

  const tickFormat = TICK_FORMAT[bucket];
  const tooltipFormat = TOOLTIP_FORMAT[bucket];

  return (
    <figure className={UsageChartClass.Root} aria-label={label}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <CartesianGrid className={UsageChartClass.Grid} strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="at"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(value: number) => tickFormat.format(value)}
            tick={{ className: UsageChartClass.Tick, fontSize: 11 }}
            className={UsageChartClass.Axis}
            minTickGap={24}
          />
          <YAxis
            allowDecimals={false}
            width={formatValue === formatCount ? COUNT_AXIS_WIDTH : FORMATTED_AXIS_WIDTH}
            tickFormatter={(value: number) => formatValue(value)}
            tick={{ className: UsageChartClass.Tick, fontSize: 11 }}
            className={UsageChartClass.Axis}
          />
          <Tooltip
            cursor={{ className: UsageChartClass.Cursor }}
            wrapperClassName={UsageChartClass.Tooltip}
            labelFormatter={(value) => tooltipFormat.format(Number(value))}
            formatter={(value, name) => [formatValue(Number(value ?? 0)), series ? String(name) : valueLabel]}
          />
          {series ? (
            series.map((entry, index) => (
              <Bar
                key={entry.key}
                dataKey={(row: ChartRow) => row.parts?.[entry.key] ?? 0}
                name={entry.label}
                stackId={STACK_ID}
                className={usageChartSeriesClass(index)}
                isAnimationActive={false}
              />
            ))
          ) : (
            <Bar dataKey="total" className={UsageChartClass.Bar} radius={[2, 2, 0, 0]} isAnimationActive={false} />
          )}
        </BarChart>
      </ResponsiveContainer>
      {series && (
        <ul className={UsageChartClass.Legend}>
          {series.map((entry, index) => (
            <li key={entry.key}>
              <span className={`${UsageChartClass.Swatch} ${usageChartSeriesClass(index)}`} aria-hidden="true" />
              {entry.label}
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
