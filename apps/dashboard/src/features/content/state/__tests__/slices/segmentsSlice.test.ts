import { describe, expect, it } from "vitest";
import { dirtyOwners, segmentsReducer } from "../../slices/segmentsSlice";

describe("segmentsSlice", () => {
  const seed = {
    byOwner: {
      info: {
        initial: [{ position: 0, label: "Help", targetSlug: "help" }],
        current: [{ position: 0, label: "Help", targetSlug: "help" }],
      },
      help: {
        initial: [{ position: 0, label: "Privacy", targetSlug: "privacy" }],
        current: [{ position: 0, label: "Privacy", targetSlug: "privacy" }],
      },
    },
  };

  it("reorder within owner", () => {
    const s0 = {
      byOwner: {
        ...seed.byOwner,
        info: {
          ...seed.byOwner.info,
          current: [
            { position: 0, label: "Help", targetSlug: "help" },
            { position: 1, label: "Privacy", targetSlug: "privacy" },
          ],
          initial: [
            { position: 0, label: "Help", targetSlug: "help" },
            { position: 1, label: "Privacy", targetSlug: "privacy" },
          ],
        },
      },
    };
    const s1 = segmentsReducer(s0, { type: "reorder", owner: "info", from: 0, to: 1 });
    expect(s1.byOwner.info.current.map((s) => s.targetSlug)).toEqual(["privacy", "help"]);
    expect(dirtyOwners(s1)).toEqual(["info"]);
  });

  it("cross-owner move marks both dirty", () => {
    const s1 = segmentsReducer(seed, { type: "move", target: "privacy", from: "help", to: "info", position: 1 });
    expect(s1.byOwner.help.current).toEqual([]);
    expect(s1.byOwner.info.current.map((s) => s.targetSlug)).toEqual(["help", "privacy"]);
    expect(new Set(dirtyOwners(s1))).toEqual(new Set(["help", "info"]));
  });

  it("add (orphan-promote)", () => {
    const s1 = segmentsReducer(seed, { type: "add", owner: "info", target: "support", position: 1 });
    expect(s1.byOwner.info.current.map((s) => s.targetSlug)).toEqual(["help", "support"]);
    expect(dirtyOwners(s1)).toEqual(["info"]);
  });

  it("remove (segment-demote)", () => {
    const s1 = segmentsReducer(seed, { type: "remove", owner: "info", target: "help" });
    expect(s1.byOwner.info.current).toEqual([]);
    expect(dirtyOwners(s1)).toEqual(["info"]);
  });

  it("idempotent move back to initial → clean", () => {
    const s1 = segmentsReducer(seed, { type: "move", target: "privacy", from: "help", to: "info", position: 1 });
    const s2 = segmentsReducer(s1, { type: "move", target: "privacy", from: "info", to: "help", position: 0 });
    expect(dirtyOwners(s2)).toEqual([]);
  });
});
