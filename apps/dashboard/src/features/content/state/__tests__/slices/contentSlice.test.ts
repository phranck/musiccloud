import { describe, expect, it } from "vitest";
import { contentReducer, dirtySlugs, isContentDirty } from "../../slices/contentSlice";

describe("contentSlice", () => {
  it("edit + revert", () => {
    const s0 = contentReducer({ pages: {} }, { type: "hydrate", entries: [{ slug: "info", content: "# A" }] });
    const s1 = contentReducer(s0, { type: "set", slug: "info", value: "# B" });
    expect(dirtySlugs(s1)).toEqual(["info"]);
    const s2 = contentReducer(s1, { type: "set", slug: "info", value: "# A" });
    expect(dirtySlugs(s2)).toEqual([]);
  });

  it("isContentDirty: unknown slug → false, hydrated clean → false, edited → true", () => {
    const s0 = contentReducer({ pages: {} }, { type: "hydrate", entries: [{ slug: "info", content: "# A" }] });
    expect(isContentDirty(s0, "missing")).toBe(false);
    expect(isContentDirty(s0, "info")).toBe(false);
    const s1 = contentReducer(s0, { type: "set", slug: "info", value: "# B" });
    expect(isContentDirty(s1, "info")).toBe(true);
  });
});
