import { describe, expect, it } from "vitest";
import { sidebarReducer, isDirty } from "../../slices/sidebarSlice";

describe("sidebarSlice", () => {
  it("initial state is clean", () => {
    const s = sidebarReducer(
      { initial: ["info", "help"], current: ["info", "help"] },
      { type: "noop" } as never,
    );
    expect(isDirty(s)).toBe(false);
  });

  it("reorder-top-level becomes dirty", () => {
    const s0 = { initial: ["info", "help"], current: ["info", "help"] };
    const s1 = sidebarReducer(s0, { type: "reorder-top-level", from: 0, to: 1 });
    expect(s1.current).toEqual(["help", "info"]);
    expect(isDirty(s1)).toBe(true);
  });

  it("reorder back to initial becomes clean", () => {
    const s0 = { initial: ["info", "help"], current: ["info", "help"] };
    const s1 = sidebarReducer(s0, { type: "reorder-top-level", from: 0, to: 1 });
    const s2 = sidebarReducer(s1, { type: "reorder-top-level", from: 0, to: 1 });
    expect(s2.current).toEqual(s0.initial);
    expect(isDirty(s2)).toBe(false);
  });

  it("hydrate sets initial = current = next", () => {
    const s = sidebarReducer(
      { initial: [], current: [] },
      { type: "hydrate", topLevelOrder: ["a", "b"] },
    );
    expect(s.initial).toEqual(["a", "b"]);
    expect(s.current).toEqual(["a", "b"]);
  });
});
