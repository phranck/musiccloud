import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AdminRepository,
  ContentPageRow,
  ContentPageTranslationRow,
  PageSegmentRow,
} from "../db/admin-repository.js";
import { updateManagedContentPageMeta } from "../services/admin-content.js";

// ---------------------------------------------------------------------------
// In-memory repo state
// ---------------------------------------------------------------------------
const pages = new Map<string, ContentPageRow>();
const segmentsByOwner = new Map<string, PageSegmentRow[]>();

function makePage(overrides: Partial<ContentPageRow> = {}): ContentPageRow {
  return {
    slug: "test-page",
    title: "Test Page",
    content: "",
    status: "draft",
    showTitle: true,
    titleAlignment: "left",
    pageType: "default",
    displayMode: "fullscreen",
    overlayWidth: "regular",
    contentCardStyle: "recessed",
    createdBy: null,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: null,
    contentUpdatedAt: new Date(),
    ...overrides,
  };
}

const repo: Partial<AdminRepository> = {
  async getContentPageBySlug(slug: string) {
    return pages.get(slug) ?? null;
  },
  async contentPageSlugExists(slug: string) {
    return pages.has(slug);
  },
  async updateContentPageMeta(slug: string, data) {
    const existing = pages.get(slug);
    if (!existing) return null;
    const updated: ContentPageRow = { ...existing, ...data, updatedAt: new Date() };
    pages.set(updated.slug, updated);
    return updated;
  },
  async getAdminUsernamesByIds() {
    return new Map();
  },
  async listSegmentsForOwner(ownerSlug: string) {
    return segmentsByOwner.get(ownerSlug) ?? [];
  },
  async listSegmentTranslationsForOwner() {
    return [];
  },
  async deleteSegmentsForOwner() {
    // no-op
  },
  async setContentPageContentUpdatedAt() {
    // no-op
  },
};

vi.mock("../db/index.js", () => ({ getAdminRepository: async () => repo }));
vi.mock("../services/admin-translations.js", () => ({
  getPageTranslationsWithStatus: async () => ({
    statuses: { en: "ready", de: "missing" },
    translations: [] as ContentPageTranslationRow[],
  }),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("updateManagedContentPageMeta", () => {
  beforeEach(() => {
    pages.clear();
    pages.set("test-page", makePage({ slug: "test-page" }));
    pages.set("card-style-test", makePage({ slug: "card-style-test", title: "x" }));
  });

  it("rejects invalid contentCardStyle", async () => {
    const result = await updateManagedContentPageMeta("test-page", {
      contentCardStyle: "garbage" as never,
      updatedBy: null,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INVALID_INPUT");
      expect(result.message).toMatch(/contentCardStyle/i);
    }
  });

  it("accepts contentCardStyle 'default' and 'recessed'", async () => {
    const a = await updateManagedContentPageMeta("card-style-test", {
      contentCardStyle: "default",
      updatedBy: null,
    });
    expect(a.ok).toBe(true);
    if (a.ok) expect(a.data.contentCardStyle).toBe("default");

    const b = await updateManagedContentPageMeta("card-style-test", {
      contentCardStyle: "recessed",
      updatedBy: null,
    });
    expect(b.ok).toBe(true);
    if (b.ok) expect(b.data.contentCardStyle).toBe("recessed");
  });
});
