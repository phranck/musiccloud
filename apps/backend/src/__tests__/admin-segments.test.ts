import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AdminRepository,
  ContentPageRow,
  PageSegmentInputRow,
  PageSegmentRow,
} from "../db/admin-repository.js";
import { replaceSegments } from "../services/admin-segments.js";

const pages = new Map<string, ContentPageRow>();
let segmentsByOwner = new Map<string, PageSegmentRow[]>();
let lastReplace: { ownerSlug: string; inputs: PageSegmentInputRow[] } | null = null;

function makePage(overrides: Partial<ContentPageRow> = {}): ContentPageRow {
  return {
    slug: "sample",
    title: "Sample",
    content: "",
    status: "draft",
    showTitle: true,
    pageType: "default",
    displayMode: "fullscreen",
    overlayWidth: "regular",
    overlayHeight: "regular",
    createdBy: null,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: null,
    ...overrides,
  };
}

const repo: Partial<AdminRepository> = {
  async getContentPageBySlug(slug: string) {
    return pages.get(slug) ?? null;
  },
  async getContentPagesBySlugs(slugs: string[]) {
    return slugs.map((s) => pages.get(s)).filter((r): r is ContentPageRow => r !== undefined);
  },
  async listSegmentsForOwner(ownerSlug: string) {
    return segmentsByOwner.get(ownerSlug) ?? [];
  },
  async replaceSegmentsForOwner(ownerSlug: string, inputs: PageSegmentInputRow[]) {
    lastReplace = { ownerSlug, inputs };
    const rows: PageSegmentRow[] = inputs.map((s, i) => ({
      id: i + 1,
      ownerSlug,
      targetSlug: s.targetSlug,
      position: s.position,
      label: s.label,
    }));
    segmentsByOwner.set(ownerSlug, rows);
    return rows;
  },
};

vi.mock("../db/index.js", () => ({
  getAdminRepository: async () => repo,
}));

describe("replaceSegments", () => {
  beforeEach(() => {
    pages.clear();
    segmentsByOwner = new Map();
    lastReplace = null;

    pages.set("owner-slug", makePage({ slug: "owner-slug", pageType: "segmented" }));
    pages.set("default-a", makePage({ slug: "default-a", pageType: "default" }));
    pages.set("default-b", makePage({ slug: "default-b", pageType: "default" }));
    pages.set("segmented-target", makePage({ slug: "segmented-target", pageType: "segmented" }));
  });

  it("rejects pointing a segment at a non-default page", async () => {
    const result = await replaceSegments("owner-slug", [
      { position: 0, label: "Segment A", targetSlug: "segmented-target" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("TARGET_NOT_DEFAULT");
  });

  it("rejects self-reference", async () => {
    const result = await replaceSegments("owner-slug", [
      { position: 0, label: "Self", targetSlug: "owner-slug" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_INPUT");
  });

  it("rejects missing target", async () => {
    const result = await replaceSegments("owner-slug", [
      { position: 0, label: "Ghost", targetSlug: "does-not-exist" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("TARGET_NOT_FOUND");
  });

  it("rejects empty labels", async () => {
    const result = await replaceSegments("owner-slug", [
      { position: 0, label: "   ", targetSlug: "default-a" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_INPUT");
  });

  it("rejects when owner is not segmented", async () => {
    pages.set("owner-slug", makePage({ slug: "owner-slug", pageType: "default" }));
    const result = await replaceSegments("owner-slug", [
      { position: 0, label: "A", targetSlug: "default-a" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_INPUT");
  });

  it("returns NOT_FOUND for unknown owner", async () => {
    const result = await replaceSegments("nobody", [
      { position: 0, label: "X", targetSlug: "default-a" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("NOT_FOUND");
  });

  it("normalises positions to a contiguous 0..N-1 range", async () => {
    const result = await replaceSegments("owner-slug", [
      { position: 10, label: "A", targetSlug: "default-a" },
      { position: 2, label: "B", targetSlug: "default-b" },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.map((s) => s.position)).toEqual([0, 1]);
      expect(result.data.map((s) => s.label)).toEqual(["B", "A"]);
    }
  });

  it("trims labels before persisting", async () => {
    const result = await replaceSegments("owner-slug", [
      { position: 0, label: "  Trimmed  ", targetSlug: "default-a" },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data[0].label).toBe("Trimmed");
    expect(lastReplace?.inputs[0].label).toBe("Trimmed");
  });
});
