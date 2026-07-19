import { ContentContext } from "@musiccloud/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminRepository, ContentPageRow, NavItemRow } from "../db/admin-repository.js";

let page: ContentPageRow | null = null;
let navRows: NavItemRow[] = [];

const baseRepo: Partial<AdminRepository> = {
  async getContentPageBySlug(slug: string) {
    return page?.slug === slug ? page : null;
  },
  async getPublishedContentPageByPath(context, path) {
    return page?.publications?.some(
      (publication) =>
        publication.context === context && publication.path === path && publication.status === "published",
    )
      ? page
      : null;
  },
  async getPublishedContentPageBySlug(slug: string) {
    return page?.slug === slug && page.status === "published" && (page.publications?.length ?? 0) === 0 ? page : null;
  },
  async listPublishedContentPages() {
    if (!page) return [];
    const publications = page.publications ?? [];
    const isPublished =
      publications.length > 0
        ? publications.some(
            (publication) => publication.context === ContentContext.Frontend && publication.status === "published",
          )
        : page.status === "published";
    return isPublished ? [{ slug: page.slug, title: page.title }] : [];
  },
  async listSegmentsForOwner() {
    return [];
  },
  async getPublishedContentPagesBySlugs() {
    return [];
  },
  async listAdminNavItems() {
    return navRows;
  },
};

vi.mock("../db/index.js", () => ({ getAdminRepository: async () => baseRepo }));

function mkPage(overrides: Partial<ContentPageRow> = {}): ContentPageRow {
  return {
    slug: "about",
    title: "About",
    content: "EN body",
    status: "published",
    showTitle: true,
    titleAlignment: "left",
    pageType: "default",
    displayMode: "fullscreen",
    overlayWidth: "regular",
    createdBy: null,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: null,
    contentUpdatedAt: new Date(),
    ...overrides,
  };
}

function mkNavRow(overrides: Partial<NavItemRow> = {}): NavItemRow {
  return {
    id: 1,
    navId: "header",
    pageSlug: null,
    pageTitle: null,
    url: "https://example.com",
    target: "_self",
    label: "Home",
    position: 0,
    pageType: null,
    pageDisplayMode: null,
    pageOverlayWidth: null,
    labelUpdatedAt: new Date(),
    ...overrides,
  };
}

describe("getPublicContentPage canonical editorial content", () => {
  beforeEach(() => {
    page = null;
  });

  it("returns the canonical title and content", async () => {
    page = mkPage();
    const { getPublicContentPage } = await import("../services/admin-content.js");
    const r = await getPublicContentPage("about");
    expect(r?.title).toBe("About");
    expect(r?.content).toBe("EN body");
  });

  it("keeps the legacy slug list and detail APIs consistent when the Frontend path differs", async () => {
    page = mkPage({
      id: "page-privacy",
      slug: "privacy",
      contextMask: ContentContext.Frontend,
      publications: [
        {
          pageId: "page-privacy",
          context: ContentContext.Frontend,
          path: "/legal",
          status: "published",
          templateKey: "frontend-default",
        },
      ],
    });
    const { getPublicContentPage, getPublicContentPages } = await import("../services/admin-content.js");

    await expect(getPublicContentPages()).resolves.toEqual([{ slug: "privacy", title: "About" }]);
    await expect(getPublicContentPage("privacy")).resolves.toMatchObject({ slug: "privacy" });
  });

  it("does not expose a Developer Portal-only publication through the legacy Frontend slug", async () => {
    page = mkPage({
      id: "page-privacy",
      slug: "privacy",
      contextMask: ContentContext.DeveloperPortal,
      publications: [
        {
          pageId: "page-privacy",
          context: ContentContext.DeveloperPortal,
          path: "/privacy",
          status: "published",
          templateKey: "developer-default",
        },
      ],
    });
    const { getPublicContentPage } = await import("../services/admin-content.js");

    await expect(getPublicContentPage("privacy")).resolves.toBeNull();
  });

  it("does not expose a draft Frontend publication through the legacy Frontend slug", async () => {
    page = mkPage({
      id: "page-privacy",
      slug: "privacy",
      contextMask: ContentContext.Frontend,
      publications: [
        {
          pageId: "page-privacy",
          context: ContentContext.Frontend,
          path: "/legal",
          status: "draft",
          templateKey: "frontend-default",
        },
      ],
    });
    const { getPublicContentPage } = await import("../services/admin-content.js");

    await expect(getPublicContentPage("privacy")).resolves.toBeNull();
  });
});

describe("getPublicNavItems canonical editorial labels", () => {
  beforeEach(() => {
    navRows = [];
  });

  it("returns the canonical custom label", async () => {
    navRows = [mkNavRow({ label: "Home", pageSlug: null })];
    const { getPublicNavItems } = await import("../services/admin-nav.js");
    const result = await getPublicNavItems("header");
    expect(result[0]?.label).toBe("Home");
  });

  it("falls back to the canonical linked-page title when no custom label exists", async () => {
    navRows = [mkNavRow({ id: 2, label: null, pageSlug: "about", pageTitle: "About" })];
    const { getPublicNavItems } = await import("../services/admin-nav.js");
    const result = await getPublicNavItems("header");
    expect(result[0]?.label).toBe("About");
    expect(result[0]?.pageTitle).toBe("About");
  });
});
