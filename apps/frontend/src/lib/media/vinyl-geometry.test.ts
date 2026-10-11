import { describe, expect, it } from "vitest";
import {
  labelArcPath,
  vinylGrooveSpiralPath,
  vinylSideDarkBands,
  vinylSideGrooveLayout,
  vinylSideGroovePath,
} from "./vinyl-geometry.js";

/** A pause groove is a full circle drawn as two large arcs. */
const PAUSE_GROOVE_ARC = " 0 1 1 ";
/** A spiral segment is drawn as quarter-turn arcs with the small-arc flag. */
const SPIRAL_ARC = " 0 0 0 ";

/** Every arc endpoint of a path as its distance from the viewBox centre. */
function endpointRadii(path: string): number[] {
  return [...path.matchAll(/A [\d.]+ [\d.]+ 0 0 0 ([\d.]+) ([\d.]+)/g)].map(([, x, y]) =>
    Math.hypot(Number(x) - 50, Number(y) - 50),
  );
}

describe("vinyl geometry", () => {
  it("returns SVG paths for the record groove and label arc", () => {
    expect(vinylGrooveSpiralPath(45, 19, 49.5)).toMatch(/^M /);
    expect(labelArcPath(44, 73)).toMatch(/^M /);
  });

  /**
   * The groove ships as a data URL inside every share page and is rasterised
   * when the record appears. As a polyline it was 115 KB per stroke and about
   * ten thousand segments, 694 KB of a share page's HTML.
   */
  it("draws the 72-turn groove in a few kilobytes", () => {
    const path = vinylGrooveSpiralPath(72, 19, 49.5);

    expect(path.length).toBeLessThan(12_000);
    expect(path.match(/A /g)).toHaveLength(72 * 4);
  });

  it("keeps every arc endpoint on the spiral, running from the rim to the label", () => {
    const turns = 72;
    const radii = endpointRadii(vinylGrooveSpiralPath(turns, 19, 49.5));
    const pitchPerQuarterTurn = (49.5 - 19) / (turns * 4);

    expect(radii[0]).toBeCloseTo(49.5 - pitchPerQuarterTurn, 1);
    expect(radii.at(-1)).toBeCloseTo(19, 1);
    for (let index = 1; index < radii.length; index++) {
      expect(radii[index - 1] - (radii[index] ?? 0)).toBeCloseTo(pitchPerQuarterTurn, 1);
    }
  });

  it("maps track durations to one deterministic pause groove with a radial gap between two tracks", () => {
    const side = {
      label: "B",
      tracks: [
        { position: "B1", title: "J.O.S.", durationMs: 714_000 },
        { position: "B2", title: "Flamingo", durationMs: 480_000 },
      ],
    };
    const options = { innerRadius: 19, outerRadius: 49.5, turns: 45 };

    const path = vinylSideGroovePath(side, options);
    const segments = path.split("M ").filter(Boolean);
    const pauseSegments = segments.filter((segment) => segment.includes(PAUSE_GROOVE_ARC));
    const pauseRadius = 50 - Number(pauseSegments[0]?.split(" ")[1]);
    const trackOuterRadius = 48;
    const trackInnerRadius = 20.5;
    const pauseBandWidth = 1;
    const expectedPauseRadius =
      trackOuterRadius -
      (714_000 / 1_194_000) * (trackOuterRadius - trackInnerRadius - pauseBandWidth) -
      pauseBandWidth / 2;

    expect(segments).toHaveLength(5);
    expect(pauseSegments).toHaveLength(1);
    expect(pauseRadius).toBeCloseTo(expectedPauseRadius, 1);
    expect(vinylSideDarkBands(side, options)).toEqual([
      { radius: 48.75, width: 1.5 },
      { radius: expect.closeTo(expectedPauseRadius, 1), width: 1 },
      { radius: 19.75, width: 1.5 },
    ]);
    expect(segments[0]).toContain(SPIRAL_ARC);
    expect(segments.at(-1)).toContain(SPIRAL_ARC);
    expect(vinylSideGroovePath(side, options)).toBe(path);
  });

  it("adds no pause groove for a one-track side", () => {
    const path = vinylSideGroovePath(
      {
        label: "A",
        tracks: [{ position: "A", title: "The Sermon", durationMs: 1_194_000 }],
      },
      { innerRadius: 19, outerRadius: 49.5, turns: 45 },
    );
    const segments = path.split("M ").filter(Boolean);

    expect(segments).toHaveLength(3);
    expect(segments.filter((segment) => segment.includes(PAUSE_GROOVE_ARC))).toHaveLength(0);
    expect(segments[0]).toContain(SPIRAL_ARC);
    expect(segments.at(-1)).toContain(SPIRAL_ARC);
  });

  it.each([
    { label: "A", tracks: [] },
    { label: "A", tracks: [{ position: "A1", title: "Silence", durationMs: 0 }] },
  ])("falls back to finite homogeneous grooves for invalid side timing", (side) => {
    const options = { innerRadius: 19, outerRadius: 49.5, turns: 45 };

    const layout = vinylSideGrooveLayout(side, options);

    expect(layout.path).toBe(vinylGrooveSpiralPath(options.turns, options.innerRadius, options.outerRadius));
    expect(layout.path).not.toMatch(/NaN|Infinity/);
    expect(layout.darkBands).toEqual([]);
  });
});
