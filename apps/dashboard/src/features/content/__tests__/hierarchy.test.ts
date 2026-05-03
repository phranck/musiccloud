import type { ContentPageSummary, PageSegmentSummary } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";

import { groupPagesByHierarchy } from "../hierarchy";

function page(overrides: Partial<ContentPageSummary> & { slug: string }): ContentPageSummary {
  return {
    title: overrides.slug,
    status: "draft",
    showTitle: true,
    titleAlignment: "left",
    pageType: "default",
    displayMode: "fullscreen",
    overlayWidth: "regular",
    contentCardStyle: "default",
    createdByUsername: null,
    updatedByUsername: null,
    createdAt: "2026-05-01T00:00:00Z",
    updatedAt: null,
    translationStatus: { de: "missing" } as ContentPageSummary["translationStatus"],
    ...overrides,
  };
}

function seg(targetSlug: string, position: number, label = targetSlug): PageSegmentSummary {
  return { targetSlug, position, label };
}

describe("groupPagesByHierarchy", () => {
  it("empty input yields empty blocks and orphans", () => {
    const r = groupPagesByHierarchy([]);
    expect(r.segmentedBlocks).toEqual([]);
    expect(r.orphanDefaults).toEqual([]);
  });

  it("segmented parent without children yields a block with empty children", () => {
    const parent = page({ slug: "info", pageType: "segmented" });
    const r = groupPagesByHierarchy([parent]);
    expect(r.segmentedBlocks).toEqual([{ parent, children: [] }]);
    expect(r.orphanDefaults).toEqual([]);
  });

  it("segmented parent children are sorted by position", () => {
    const a = page({ slug: "a" });
    const b = page({ slug: "b" });
    const parent = page({
      slug: "info",
      pageType: "segmented",
      segments: [seg("b", 1), seg("a", 0)],
    });
    const r = groupPagesByHierarchy([parent, a, b]);
    expect(r.segmentedBlocks[0].children.map((c) => c.slug)).toEqual(["a", "b"]);
  });

  it("default page with no parent lands in orphanDefaults", () => {
    const orphan = page({ slug: "lone" });
    const parent = page({ slug: "info", pageType: "segmented" });
    const r = groupPagesByHierarchy([parent, orphan]);
    expect(r.orphanDefaults.map((p) => p.slug)).toEqual(["lone"]);
  });

  it("a child claimed by the first parent is not assigned to a later parent", () => {
    const sub = page({ slug: "sub" });
    const p1 = page({ slug: "p1", pageType: "segmented", segments: [seg("sub", 0)] });
    const p2 = page({ slug: "p2", pageType: "segmented", segments: [seg("sub", 0)] });
    const r = groupPagesByHierarchy([p1, p2, sub]);
    expect(r.segmentedBlocks[0].children.map((c) => c.slug)).toEqual(["sub"]);
    expect(r.segmentedBlocks[1].children).toEqual([]);
  });

  it("a claimed segment child does not surface as an orphan", () => {
    const sub = page({ slug: "sub" });
    const parent = page({ slug: "info", pageType: "segmented", segments: [seg("sub", 0)] });
    const r = groupPagesByHierarchy([parent, sub]);
    expect(r.orphanDefaults).toEqual([]);
  });

  it("segments referencing missing slugs are silently dropped", () => {
    const parent = page({ slug: "info", pageType: "segmented", segments: [seg("ghost", 0)] });
    const r = groupPagesByHierarchy([parent]);
    expect(r.segmentedBlocks[0].children).toEqual([]);
  });
});
