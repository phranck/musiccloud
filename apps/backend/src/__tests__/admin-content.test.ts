import { ContentContext } from "@musiccloud/shared";
import type { MarkedExtension } from "marked";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AdminRepository,
  ContentPageRow,
  ContentPageTranslationRow,
  PageSegmentRow,
} from "../db/admin-repository.js";
import {
  createManagedContentPage,
  normalizeAndValidateContentPublications,
  updateManagedContentPageMeta,
} from "../services/admin-content.js";
import { createMarkdownExtensionRegistry } from "../services/markdown/extension-registry.js";

// ---------------------------------------------------------------------------
// In-memory repo state
// ---------------------------------------------------------------------------
const pages = new Map<string, ContentPageRow>();
const segmentsByOwner = new Map<string, PageSegmentRow[]>();
const replacedPublications = vi.fn();
let createError: unknown;
let updateError: unknown;
let navigationEntries: Awaited<ReturnType<AdminRepository["listNavigationConfiguration"]>> = [];

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
  async getContentPageById(id: string) {
    return [...pages.values()].find((candidate) => candidate.id === id) ?? null;
  },
  async getContentPageBySlug(slug: string) {
    return pages.get(slug) ?? null;
  },
  async contentPageSlugExists(slug: string) {
    return pages.has(slug);
  },
  async createContentPage(data) {
    if (createError) throw createError;
    const created = makePage({
      ...data,
      id: `page-${data.slug}`,
      content: "",
      status: data.status ?? "draft",
      pageType: data.pageType ?? "default",
      contextMask: data.contextMask,
      publications: data.publications?.map((publication) => ({ pageId: `page-${data.slug}`, ...publication })),
    });
    pages.set(created.slug, created);
    return created;
  },
  async updateContentPageMeta(slug: string, data) {
    if (updateError) throw updateError;
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
  async replaceContentPublications(pageId, publications) {
    replacedPublications(pageId, publications);
    return publications.map((publication) => ({ pageId, ...publication }));
  },
  async listNavigationConfiguration() {
    return navigationEntries;
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
    replacedPublications.mockReset();
    createError = undefined;
    updateError = undefined;
    navigationEntries = [];
    pages.clear();
    pages.set("test-page", makePage({ id: "page-test", slug: "test-page" }));
    pages.set("card-style-test", makePage({ slug: "card-style-test", title: "x" }));
  });

  it("rejects reserved Developer Portal publications before persistence", async () => {
    const result = await updateManagedContentPageMeta("page-test", {
      contextMask: ContentContext.Frontend | ContentContext.DeveloperPortal,
      publications: [
        {
          context: ContentContext.Frontend,
          path: "/test-page",
          status: "draft",
          templateKey: "frontend-default",
        },
        {
          context: ContentContext.DeveloperPortal,
          path: "/docs/crawler-architecture",
          status: "draft",
          templateKey: "developer-default",
        },
      ],
      updatedBy: null,
    });

    expect(result).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(replacedPublications).not.toHaveBeenCalled();
  });

  it("rejects context removal while navigation still depends on it", async () => {
    pages.set(
      "test-page",
      makePage({
        id: "page-test",
        contextMask: ContentContext.Frontend | ContentContext.DeveloperPortal,
        publications: [
          {
            pageId: "page-test",
            context: ContentContext.Frontend,
            path: "/test-page",
            status: "draft",
            templateKey: "frontend-default",
          },
          {
            pageId: "page-test",
            context: ContentContext.DeveloperPortal,
            path: "/test-page",
            status: "draft",
            templateKey: "developer-default",
          },
        ],
      }),
    );
    navigationEntries = [
      {
        id: 3,
        targetKind: "page",
        pageId: "page-test",
        pageSlug: "test-page",
        pageTitle: "Test Page",
        url: null,
        systemKey: null,
        target: "_self",
        label: null,
        contextMask: ContentContext.DeveloperPortal,
        areaMask: 1,
        placements: [{ context: ContentContext.DeveloperPortal, area: 1, position: 0 }],
        translations: {},
      },
    ];

    const result = await updateManagedContentPageMeta("page-test", {
      contextMask: ContentContext.Frontend,
      publications: [
        {
          context: ContentContext.Frontend,
          path: "/test-page",
          status: "draft",
          templateKey: "frontend-default",
        },
      ],
      updatedBy: null,
    });

    expect(result).toEqual({
      ok: false,
      code: "INVALID_INPUT",
      message: "Remove this page from Developer Portal navigation before disabling that context",
    });
    expect(replacedPublications).not.toHaveBeenCalled();
  });

  it("normalizes publications and resolves the page through its stable id", async () => {
    const result = await updateManagedContentPageMeta("page-test", {
      contextMask: ContentContext.Frontend,
      publications: [
        {
          context: ContentContext.Frontend,
          path: "//privacy/",
          status: "draft",
          templateKey: "frontend-default",
        },
      ],
      updatedBy: null,
    });

    expect(result.ok).toBe(true);
    expect(replacedPublications).toHaveBeenCalledWith("page-test", [expect.objectContaining({ path: "/privacy" })]);
  });

  it("treats an empty additive publication list as a legacy Frontend page", async () => {
    pages.set("test-page", makePage({ id: "page-test", slug: "test-page", status: "draft", publications: [] }));

    const result = await updateManagedContentPageMeta("page-test", {
      status: "published",
      updatedBy: null,
    });

    expect(result.ok).toBe(true);
    expect(replacedPublications).toHaveBeenCalledWith("page-test", [
      expect.objectContaining({ path: "/test-page", status: "published" }),
    ]);
  });

  it("maps a create-time context path collision to PATH_TAKEN", async () => {
    createError = { code: "23505" };

    const result = await createManagedContentPage({
      slug: "new-page",
      title: "New Page",
      publications: [
        {
          context: ContentContext.Frontend,
          path: "/privacy",
          status: "draft",
          templateKey: "frontend-default",
        },
      ],
      createdBy: null,
    });

    expect(result).toMatchObject({ ok: false, code: "PATH_TAKEN" });
  });

  it("maps an atomic update-time context path collision to PATH_TAKEN", async () => {
    updateError = { code: "23505" };

    const result = await updateManagedContentPageMeta("page-test", {
      publications: [
        {
          context: ContentContext.Frontend,
          path: "/privacy",
          status: "draft",
          templateKey: "frontend-default",
        },
      ],
      updatedBy: null,
    });

    expect(result).toMatchObject({ ok: false, code: "PATH_TAKEN" });
  });

  it("rejects publication when Markdown extensions are unavailable in an enabled context", async () => {
    const tiersExtension: MarkedExtension = {
      extensions: [
        {
          name: "tiers",
          level: "block",
          tokenizer(source) {
            const match = source.match(/^:::tiers\r?\n([\s\S]*?)\r?\n:::/);
            if (match) return { type: "tiers", raw: match[0], text: match[1] };
          },
          renderer(token) {
            return `<section>${token.text}</section>`;
          },
        },
      ],
    };
    const registry = createMarkdownExtensionRegistry([
      {
        name: "tiers",
        allowedContextMask: ContentContext.DeveloperPortal,
        createMarkedExtension: () => tiersExtension,
        tokenTypes: ["tiers"],
      },
    ]);

    const result = normalizeAndValidateContentPublications(
      ContentContext.Frontend,
      [
        {
          context: ContentContext.Frontend,
          path: "/markdown-page",
          status: "published",
          templateKey: "frontend-default",
        },
      ],
      ":::tiers\nPlans\n:::",
      registry,
    );

    expect(result).toContain("tiers");
    expect(replacedPublications).not.toHaveBeenCalled();
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
