import { describe, expect, it } from "vitest";
import { labelArcPath, vinylGrooveSpiralPath, vinylSideGroovePath } from "./vinyl-geometry.js";

describe("vinyl geometry", () => {
  it("returns SVG paths for the record groove and label arc", () => {
    expect(vinylGrooveSpiralPath(45, 19, 49.5)).toMatch(/^M /);
    expect(labelArcPath(44, 73)).toMatch(/^M /);
  });

  it("maps track durations to one deterministic pause groove between two tracks", () => {
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
    const pauseSegments = segments.filter((segment) => segment.includes(" A "));
    const pauseRadius = 50 - Number(pauseSegments[0]?.split(" ")[1]);
    const trackOuterRadius = 48;
    const trackInnerRadius = 20.5;
    const expectedPauseRadius = trackOuterRadius - (714_000 / 1_194_000) * (trackOuterRadius - trackInnerRadius);

    expect(segments).toHaveLength(5);
    expect(pauseSegments).toHaveLength(1);
    expect(pauseRadius).toBeCloseTo(expectedPauseRadius, 1);
    expect(segments[0]).toMatch(/ L /);
    expect(segments.at(-1)).toMatch(/ L /);
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
    expect(segments.filter((segment) => segment.includes(" A "))).toHaveLength(0);
    expect(segments[0]).toMatch(/ L /);
    expect(segments.at(-1)).toMatch(/ L /);
  });
});
