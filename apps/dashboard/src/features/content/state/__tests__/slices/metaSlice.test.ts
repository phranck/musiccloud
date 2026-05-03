import { describe, expect, it } from "vitest";
import { dirtySlugs, metaReducer } from "../../slices/metaSlice";
import { makeMeta } from "../factories";

describe("metaSlice", () => {
  it("hydrate seeds initial+current", () => {
    const s = metaReducer(
      { pages: {} },
      { type: "hydrate", entries: [{ slug: "info", meta: makeMeta({ title: "Info" }) }] },
    );
    expect(s.pages.info.current.title).toBe("Info");
    expect(dirtySlugs(s)).toEqual([]);
  });

  it("set-field marks dirty", () => {
    const s0 = metaReducer(
      { pages: {} },
      { type: "hydrate", entries: [{ slug: "info", meta: makeMeta({ title: "Info" }) }] },
    );
    const s1 = metaReducer(s0, { type: "set-field", slug: "info", field: "title", value: "Information" });
    expect(s1.pages.info.current.title).toBe("Information");
    expect(dirtySlugs(s1)).toEqual(["info"]);
  });

  it("setting back to initial clears dirty", () => {
    const s0 = metaReducer(
      { pages: {} },
      { type: "hydrate", entries: [{ slug: "info", meta: makeMeta({ title: "Info" }) }] },
    );
    const s1 = metaReducer(s0, { type: "set-field", slug: "info", field: "title", value: "X" });
    const s2 = metaReducer(s1, { type: "set-field", slug: "info", field: "title", value: "Info" });
    expect(dirtySlugs(s2)).toEqual([]);
  });
});
