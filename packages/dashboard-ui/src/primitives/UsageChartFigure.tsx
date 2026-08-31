import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { UsageChartBucket, UsageChartClass, type UsageChartProps } from "./usageChartContract.js";

/** Formatters are built once, because a tick formatter runs per tick on every resize. */
const HOUR_FORMAT = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" });
const FULL_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});
const COUNT_FORMAT = new Intl.NumberFormat("en-GB");

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
 * belongs to.
 *
 * @param props - See `UsageChartProps`.
 * @returns The chart, described for a screen reader by its label.
 */
export default function UsageChartFigure({ points, bucket, label, height = 180 }: UsageChartProps) {
  const data = useMemo(() => points.map((point) => ({ ...point, at: Date.parse(point.startedAt) })), [points]);

  const tickFormat = bucket === UsageChartBucket.Hour ? HOUR_FORMAT : DAY_FORMAT;

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
            width={40}
            tickFormatter={(value: number) => COUNT_FORMAT.format(value)}
            tick={{ className: UsageChartClass.Tick, fontSize: 11 }}
            className={UsageChartClass.Axis}
          />
          <Tooltip
            cursor={{ className: UsageChartClass.Cursor }}
            wrapperClassName={UsageChartClass.Tooltip}
            labelFormatter={(value) => FULL_FORMAT.format(Number(value))}
            formatter={(value) => [COUNT_FORMAT.format(Number(value ?? 0)), "Requests"]}
          />
          <Bar dataKey="total" className={UsageChartClass.Bar} radius={[2, 2, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </figure>
  );
}
