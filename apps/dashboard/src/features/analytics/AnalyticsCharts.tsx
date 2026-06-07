import { lazy, useCallback, useMemo } from "react";

const Area = lazy(() => import("recharts").then((module) => ({ default: module.Area })));
const AreaChart = lazy(() => import("recharts").then((module) => ({ default: module.AreaChart })));
const Bar = lazy(() => import("recharts").then((module) => ({ default: module.Bar })));
const BarChart = lazy(() => import("recharts").then((module) => ({ default: module.BarChart })));
const CartesianGrid = lazy(() => import("recharts").then((module) => ({ default: module.CartesianGrid })));
const ResponsiveContainer = lazy(() => import("recharts").then((module) => ({ default: module.ResponsiveContainer })));
const Tooltip = lazy(() => import("recharts").then((module) => ({ default: module.Tooltip })));
const XAxis = lazy(() => import("recharts").then((module) => ({ default: module.XAxis })));
const YAxis = lazy(() => import("recharts").then((module) => ({ default: module.YAxis })));

const CHART_MARGIN = { top: 4, right: 4, bottom: 0, left: -20 };
const BAR_RADIUS: [number, number, number, number] = [2, 2, 0, 0];
const BAR_X_AXIS_TICK = { fontSize: 10 };
const BAR_Y_AXIS_TICK = { fontSize: 10 };
const AREA_X_AXIS_TICK = { fontSize: 11 };

interface ChartThemeProps {
  gridColor: string;
  tickColor: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipColor: string;
}

interface RealtimeBarsChartProps {
  data: { time: string; visitors: number; pageviews: number }[];
  maxValue: number;
  ticks: number[];
  theme: ChartThemeProps;
  cursorColor: string;
  visitorsLabel: string;
  pageviewsLabel: string;
  formatNumber: (value: number) => string;
}

export function RealtimeBarsChart({
  data,
  maxValue,
  ticks,
  theme,
  cursorColor,
  visitorsLabel,
  pageviewsLabel,
  formatNumber,
}: RealtimeBarsChartProps) {
  const yAxisDomain = useMemo(() => [0, maxValue], [maxValue]);
  const xAxisTick = useMemo(() => ({ ...BAR_X_AXIS_TICK, fill: theme.tickColor }), [theme.tickColor]);
  const yAxisTick = useMemo(() => ({ ...BAR_Y_AXIS_TICK, fill: theme.tickColor }), [theme.tickColor]);
  const tooltipContentStyle = useMemo(
    () => ({
      fontSize: 12,
      borderRadius: 8,
      border: `1px solid ${theme.tooltipBorder}`,
      boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      background: theme.tooltipBg,
      color: theme.tooltipColor,
    }),
    [theme.tooltipBg, theme.tooltipBorder, theme.tooltipColor],
  );
  const tooltipFormatter = useCallback(
    (value: unknown, name: unknown) => [
      formatNumber(Number(value)),
      name === "visitors" ? visitorsLabel : pageviewsLabel,
    ],
    [formatNumber, pageviewsLabel, visitorsLabel],
  );
  const cursor = useMemo(() => ({ fill: cursorColor }), [cursorColor]);

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={CHART_MARGIN} barSize={5}>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.gridColor} vertical={true} />
        <XAxis
          dataKey="time"
          tick={xAxisTick}
          axisLine={false}
          tickLine={false}
          interval={1}
        />
        <YAxis
          tick={yAxisTick}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
          domain={yAxisDomain}
          ticks={ticks}
        />
        <Tooltip
          contentStyle={tooltipContentStyle}
          formatter={tooltipFormatter}
          cursor={cursor}
        />
        <Bar dataKey="visitors" fill="#f59e0b" radius={BAR_RADIUS} />
        <Bar dataKey="pageviews" fill="#a8a29e" radius={BAR_RADIUS} />
      </BarChart>
    </ResponsiveContainer>
  );
}

interface TrafficAreaChartProps {
  data: { label: string; visitors: number; pageviews: number }[];
  maxValue: number;
  ticks: number[];
  theme: ChartThemeProps;
  visitorsLabel: string;
  pageviewsLabel: string;
  formatNumber: (value: number) => string;
}

export function TrafficAreaChart({
  data,
  maxValue,
  ticks,
  theme,
  visitorsLabel,
  pageviewsLabel,
  formatNumber,
}: TrafficAreaChartProps) {
  const yAxisDomain = useMemo(() => [0, maxValue], [maxValue]);
  const xAxisTick = useMemo(() => ({ ...AREA_X_AXIS_TICK, fill: theme.tickColor }), [theme.tickColor]);
  const tooltipContentStyle = useMemo(
    () => ({
      fontSize: 12,
      borderRadius: 8,
      border: `1px solid ${theme.tooltipBorder}`,
      boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      background: theme.tooltipBg,
      color: theme.tooltipColor,
    }),
    [theme.tooltipBg, theme.tooltipBorder, theme.tooltipColor],
  );
  const tooltipFormatter = useCallback(
    (value: unknown, name: unknown) => [
      formatNumber(Number(value)),
      name === "visitors" ? visitorsLabel : pageviewsLabel,
    ],
    [formatNumber, pageviewsLabel, visitorsLabel],
  );

  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={data} margin={CHART_MARGIN}>
        <defs>
          <linearGradient id="gradPageviews" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#a8a29e" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#a8a29e" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gradVisitors" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.gridColor} vertical={false} />
        <XAxis dataKey="label" tick={xAxisTick} axisLine={false} tickLine={false} />
        <YAxis
          tick={xAxisTick}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
          domain={yAxisDomain}
          ticks={ticks}
        />
        <Tooltip contentStyle={tooltipContentStyle} formatter={tooltipFormatter} />
        <Area
          type="monotone"
          dataKey="pageviews"
          stroke="#a8a29e"
          strokeWidth={2}
          fill="url(#gradPageviews)"
          dot={false}
        />
        <Area
          type="monotone"
          dataKey="visitors"
          stroke="#f59e0b"
          strokeWidth={2}
          fill="url(#gradVisitors)"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
