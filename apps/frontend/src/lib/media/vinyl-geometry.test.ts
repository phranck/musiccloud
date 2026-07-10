import { describe, expect, it } from "vitest";
import { labelArcPath, vinylGrooveSpiralPath } from "./vinyl-geometry.js";

describe("vinyl geometry", () => {
  it("returns SVG paths for the record groove and label arc", () => {
    expect(vinylGrooveSpiralPath(45, 19, 49.5)).toMatch(/^M /);
    expect(labelArcPath(44, 73)).toMatch(/^M /);
  });
});
