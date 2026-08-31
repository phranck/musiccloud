/**
 * @file Covers the shared `UsageChart` from `@musiccloud/dashboard-ui`.
 *
 * The component lives in the shared package, which carries no test runner, so
 * it is exercised here from one of its two consumers.
 *
 * Recharts sizes itself from its container and jsdom reports every element as
 * zero wide, so nothing inside the chart is drawn under test: the rendered
 * output is the `figure`, its class and its label, and no SVG at all. The
 * assertions below stay on that side of the line. What the bars look like is
 * the library's business and is covered by the library.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { UsageChart } from "@musiccloud/dashboard-ui";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

const POINTS = [
  { startedAt: "2026-08-30T13:00:00.000Z", total: 500 },
  { startedAt: "2026-08-30T14:00:00.000Z", total: 700 },
];

/** The drawing half's source, read so the colour rule can be checked on it. */
const CHART_SOURCE = readFileSync(
  path.join(process.cwd(), "../../packages/dashboard-ui/src/primitives/UsageChartFigure.tsx"),
  "utf8",
);

describe("UsageChart", () => {
  it("describes what it shows for a reader who cannot see it", async () => {
    render(<UsageChart points={POINTS} bucket="hour" label="1,200 requests in the last day" />);

    // The drawing half arrives through `lazy`, so the figure appears once the
    // chunk has resolved rather than on the first render.
    const figure = await screen.findByRole("figure");
    expect(figure.getAttribute("aria-label")).toBe("1,200 requests in the last day");
  });

  it("carries the class name each surface paints against", async () => {
    const { container } = render(<UsageChart points={POINTS} bucket="hour" label="usage" />);

    await screen.findByRole("figure");
    expect(container.querySelector(".mc-usage-chart")).not.toBeNull();
  });

  it("names no colour of its own, so a surface can paint it with its tokens", () => {
    // Checked on the source rather than on the DOM, because the chart draws
    // nothing under jsdom and a DOM assertion here would pass against an empty
    // subtree whatever the component did.
    const colourLiteral = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/;

    expect(CHART_SOURCE).not.toMatch(colourLiteral);
  });

  it("renders an empty series rather than throwing on a project with no traffic", () => {
    expect(() => render(<UsageChart points={[]} bucket="day" label="nothing yet" />)).not.toThrow();
  });
});
