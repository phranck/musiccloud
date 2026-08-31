/**
 * A bar series small enough to sit inside a card.
 *
 * Written as inline SVG rather than through a charting library: nothing in
 * this repository draws charts yet, so adding one to draw a row of bars would
 * pick the convention for every screen that comes after without anybody
 * choosing it. The bars take `currentColor`, so each surface decides the
 * colour with its own tokens and this file decides none.
 */

/** One step of the series. */
export interface UsageSparklinePoint {
  /** The moment the step begins, as an ISO timestamp. */
  startedAt: string;
  /** How many requests fall inside it. */
  total: number;
}

/** Props for {@link UsageSparkline}. */
export interface UsageSparklineProps {
  /** The steps, in order. Steps with no traffic may be absent. */
  points: UsageSparklinePoint[];
  /** Accessible summary, because the bars themselves say nothing to a reader. */
  label: string;
  /** Drawing height in user units; the width scales to the container. */
  height?: number;
  className?: string;
}

/** Width of one step in user units, before the viewBox scales it. */
const STEP_WIDTH = 4;

/** Gap between two bars, in the same units. */
const STEP_GAP = 1;

/** What an empty or all-zero series still draws, so the row keeps its height. */
const MINIMUM_BAR = 0.5;

/**
 * Draws a usage series as bars.
 *
 * The tallest bar fills the height and every other is drawn against it, so the
 * shape shows the pattern rather than the absolute figures. The figures
 * themselves belong beside the chart, where they can be read.
 *
 * @param props - See {@link UsageSparklineProps}.
 * @returns The bar series, labelled for a screen reader.
 */
export function UsageSparkline({ points, label, height = 32, className = "" }: UsageSparklineProps) {
  const width = Math.max(points.length, 1) * (STEP_WIDTH + STEP_GAP) - STEP_GAP;
  const peak = points.reduce((highest, point) => Math.max(highest, point.total), 0);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      role="img"
      aria-label={label}
      style={{ width: "100%", height }}
    >
      {points.map((point, index) => {
        const barHeight = peak === 0 ? MINIMUM_BAR : Math.max((point.total / peak) * height, MINIMUM_BAR);
        return (
          <rect
            key={point.startedAt}
            x={index * (STEP_WIDTH + STEP_GAP)}
            y={height - barHeight}
            width={STEP_WIDTH}
            height={barHeight}
            fill="currentColor"
          />
        );
      })}
    </svg>
  );
}
