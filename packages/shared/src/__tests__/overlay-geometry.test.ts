import { describe, expect, it } from "vitest";

import {
  clampViewportRect,
  getResizeHandleCursor,
  getResizeHandleHitAreaStyle,
  moveViewportRect,
  resizeViewportRect,
  type ViewportRectConstraints,
} from "../overlay-geometry.js";

const constraints: ViewportRectConstraints = {
  viewportWidth: 1000,
  viewportHeight: 800,
  minWidth: 200,
  minHeight: 150,
  margin: 16,
};

describe("overlay geometry", () => {
  it("moves a rect while keeping it inside the viewport margins", () => {
    expect(moveViewportRect({ x: 100, y: 100, width: 300, height: 200 }, -200, 700, constraints)).toEqual({
      x: 16,
      y: 584,
      width: 300,
      height: 200,
    });
  });

  it("resizes from the south-east corner", () => {
    expect(resizeViewportRect({ x: 100, y: 100, width: 300, height: 200 }, "se", 40, 60, constraints)).toEqual({
      x: 100,
      y: 100,
      width: 340,
      height: 260,
    });
  });

  it("resizes from the north-west corner and keeps the opposite corner fixed", () => {
    expect(resizeViewportRect({ x: 100, y: 100, width: 300, height: 200 }, "nw", -40, -50, constraints)).toEqual({
      x: 60,
      y: 50,
      width: 340,
      height: 250,
    });
  });

  it("respects minimum size when resizing from west and north", () => {
    expect(resizeViewportRect({ x: 100, y: 100, width: 300, height: 200 }, "nw", 260, 90, constraints)).toEqual({
      x: 200,
      y: 150,
      width: 200,
      height: 150,
    });
  });

  it("clamps oversized stored rectangles to the viewport", () => {
    expect(clampViewportRect({ x: -100, y: -50, width: 2000, height: 2000 }, constraints)).toEqual({
      x: 16,
      y: 16,
      width: 968,
      height: 768,
    });
  });

  it("maps handles to browser resize cursors", () => {
    expect(getResizeHandleCursor("n")).toBe("ns-resize");
    expect(getResizeHandleCursor("e")).toBe("ew-resize");
    expect(getResizeHandleCursor("ne")).toBe("nesw-resize");
    expect(getResizeHandleCursor("nw")).toBe("nwse-resize");
  });

  it("provides invisible hit-area styles for edge and corner handles", () => {
    expect(getResizeHandleHitAreaStyle("n")).toMatchObject({
      top: -4,
      left: 16,
      right: 16,
      height: 8,
      cursor: "ns-resize",
    });
    expect(getResizeHandleHitAreaStyle("se")).toMatchObject({
      right: -7,
      bottom: -7,
      width: 18,
      height: 18,
      cursor: "nwse-resize",
    });
  });
});
