import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AdminRepository,
  ContentPageRow,
  ContentPageTranslationRow,
  NavItemRow,
  NavItemTranslationRow,
} from "../db/admin-repository.js";

let page: ContentPageRow | null = null;
let translations: ContentPageTranslationRow[] = [];
let navRows: NavItemRow[] = [];
let navTranslations: NavItemTranslationRow[] = [];
let pageTranslationsBySlug: Map<string, ContentPageTranslationRow[]> = new Map();

const baseRepo: Partial<AdminRepository> = {
  async getPublishedContentPageBySlug() {
    return page;
  },
  async listPageTranslations(slug: string) {
    return pageTranslationsBySlug.get(slug) ?? translations;
  },
  async listSegmentsForOwner() {
    return [];
  },
  async getPublishedContentPagesBySlugs() {
    return [];
  },
  async listSegmentTranslationsForOwner() {
    return [];
  },
  async listAdminNavItems() {
    return navRows;
  },
  async listNavTranslations() {
    return navTranslations;
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

describe("getPublicContentPage locale fallback", () => {
  beforeEach(() => {
    page = null;
    translations = [];
    pageTranslationsBySlug = new Map();
  });

  it("returns en content when no translation exists", async () => {
    page = mkPage();
    const { getPublicContentPage } = await import("../services/admin-content.js");
    const r = await getPublicContentPage("about", "de");
    expect(r?.title).toBe("About");
    expect(r?.content).toBe("EN body");
  });

  it("returns de content when a translation exists", async () => {
    page = mkPage();
    translations = [
      {
        slug: "about",
        locale: "de",
        title: "Über uns",
        content: "DE body",
        sourceUpdatedAt: new Date(),
        updatedAt: new Date(),
        updatedBy: null,
      },
    ];
    const { getPublicContentPage } = await import("../services/admin-content.js");
    const r = await getPublicContentPage("about", "de");
    expect(r?.title).toBe("Über uns");
    expect(r?.content).toBe("DE body");
  });

  it("defaults to en when requested locale is already default", async () => {
    page = mkPage();
    translations = [
      {
        slug: "about",
        locale: "de",
        title: "Über uns",
        content: "DE body",
        sourceUpdatedAt: new Date(),
        updatedAt: new Date(),
        updatedBy: null,
      },
    ];
    const { getPublicContentPage } = await import("../services/admin-content.js");
    const r = await getPublicContentPage("about", "en");
    expect(r?.title).toBe("About");
    expect(r?.content).toBe("EN body");
  });
});

describe("getPublicNavItems locale fallback", () => {
  beforeEach(() => {
    translations = [];
    navRows = [];
    navTranslations = [];
    pageTranslationsBySlug = new Map();
  });

  it("returns default label when no nav translation exists for locale", async () => {
    navRows = [mkNavRow({ label: "Home", pageSlug: null })];
    const { getPublicNavItems } = await import("../services/admin-nav.js");
    const result = await getPublicNavItems("header", "de");
    expect(result[0]?.label).toBe("Home");
  });

  it("returns translated nav label when nav translation exists for locale", async () => {
    navRows = [mkNavRow({ id: 1, label: "Home", pageSlug: null })];
    navTranslations = [
      { navItemId: 1, locale: "de", label: "Startseite", sourceUpdatedAt: new Date(), updatedAt: new Date() },
    ];
    const { getPublicNavItems } = await import("../services/admin-nav.js");
    const result = await getPublicNavItems("header", "de");
    expect(result[0]?.label).toBe("Startseite");
  });

  it("falls back to linked page translation title when nav has no custom label and a translation exists", async () => {
    navRows = [mkNavRow({ id: 2, label: null, pageSlug: "about", pageTitle: "About" })];
    navTranslations = [];
    pageTranslationsBySlug.set("about", [
      {
        slug: "about",
        locale: "de",
        title: "Über uns",
        content: "DE body",
        sourceUpdatedAt: new Date(),
        updatedAt: new Date(),
        updatedBy: null,
      },
    ]);
    const { getPublicNavItems } = await import("../services/admin-nav.js");
    const result = await getPublicNavItems("header", "de");
    expect(result[0]?.label).toBe("Über uns");
    expect(result[0]?.pageTitle).toBe("Über uns");
  });

  it("falls back to default locale title when linked page translation is missing", async () => {
    navRows = [mkNavRow({ id: 3, label: null, pageSlug: "about", pageTitle: "About" })];
    navTranslations = [];
    const { getPublicNavItems } = await import("../services/admin-nav.js");
    const result = await getPublicNavItems("header", "de");
    expect(result[0]?.label).toBe("About");
    expect(result[0]?.pageTitle).toBe("About");
  });
});
