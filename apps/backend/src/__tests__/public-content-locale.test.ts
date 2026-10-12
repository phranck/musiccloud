import { ContentContext, PublicationTemplateKey } from "@musiccloud/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminRepository, ContentPageRow, NavItemRow } from "../db/admin-repository.js";

let page: ContentPageRow | null = null;
let navRows: NavItemRow[] = [];

/** The Frontend publication rule the adapter's SQL applies, for the fake below. */
function isPublishedInFrontend(candidate: ContentPageRow): boolean {
  const publications = candidate.publications ?? [];
  return publications.length > 0
    ? publications.some(
        (publication) => publication.context === ContentContext.Frontend && publication.status === "published",
      )
    : candidate.status === "published";
}

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
  async listPublishedContentPages() {
    return page && isPublishedInFrontend(page) ? [{ slug: page.slug, title: page.title }] : [];
  },
  async listSegmentsForOwner() {
    return [];
  },
  async getPublishedContentPagesBySlugs(slugs: string[]) {
    return page && slugs.includes(page.slug) && isPublishedInFrontend(page) ? [page] : [];
  },
  async listAdminNavItems() {
    return navRows;
  },
};

vi.mock("../db/index.js", () => ({ getAdminRepository: async () => baseRepo }));

// The figures a page may name come from a plan, a setting and two rate limiters,
// none of which this test stands up. What it is about is which page is served.
vi.mock("../services/site-variables.js", () => ({
  resolveSiteVariableValues: async () => ({
    freeRequestsPerMinute: 60,
    freeRequestsPerDay: 10_000,
    projectsPerAccount: 3,
    registrationsPerProject: 5,
    keylessRequestsPerMinute: 10,
    keylessRequestsPerDay: 500,
  }),
}));

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
          templateKey: PublicationTemplateKey.FrontendDefault,
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
          templateKey: PublicationTemplateKey.DeveloperDefault,
        },
      ],
    });
    const { getPublicContentPage } = await import("../services/admin-content.js");

    await expect(getPublicContentPage("privacy")).resolves.toBeNull();
  });

  it("strips script, event handlers and javascript links from a page and from its segments", async () => {
    const hostile =
      '<script>alert(1)</script>\n\n<img src="x" onerror="alert(2)">\n\n<a href="javascript:alert(3)">click</a>';
    page = mkPage({ pageType: "segmented", content: hostile });
    const target = mkPage({ slug: "segment", title: "Segment", content: hostile });
    const { listSegmentsForOwner, getPublishedContentPagesBySlugs } = baseRepo;
    baseRepo.listSegmentsForOwner = async () => [
      { id: 1, ownerSlug: "about", targetSlug: "segment", position: 0, label: "Segment", labelUpdatedAt: new Date() },
    ];
    baseRepo.getPublishedContentPagesBySlugs = async (slugs) =>
      [page!, target].filter((candidate) => slugs.includes(candidate.slug));
    try {
      const { getPublicContentPage } = await import("../services/admin-content.js");
      const result = await getPublicContentPage("about");

      expect(result?.segments).toHaveLength(1);
      expect(result?.contentHtml).not.toMatch(/<script|onerror|javascript:/i);
      expect(result?.segments[0]?.contentHtml).not.toMatch(/<script|onerror|javascript:/i);
    } finally {
      baseRepo.listSegmentsForOwner = listSegmentsForOwner;
      baseRepo.getPublishedContentPagesBySlugs = getPublishedContentPagesBySlugs;
    }
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
          templateKey: PublicationTemplateKey.FrontendDefault,
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
