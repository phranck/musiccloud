import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminRepository, ContentPageRow, ContentPageTranslationRow } from "../db/admin-repository.js";
import { getPageTranslationsWithStatus, upsertPageTranslation } from "../services/admin-translations.js";

let page: ContentPageRow | null = null;
let translations: ContentPageTranslationRow[] = [];

const repo: Partial<AdminRepository> = {
  async getContentPageBySlug() {
    return page;
  },
  async listPageTranslations() {
    return translations;
  },
  async upsertPageTranslation(input) {
    const row: ContentPageTranslationRow = {
      slug: input.slug,
      locale: input.locale,
      title: input.title,
      content: input.content,
      translationReady: input.translationReady,
      sourceUpdatedAt: input.sourceUpdatedAt,
      updatedAt: new Date(),
      updatedBy: input.updatedBy,
    };
    translations = [...translations.filter((t) => t.locale !== input.locale), row];
    return row;
  },
  async setContentPageContentUpdatedAt() {},
};

vi.mock("../db/index.js", () => ({ getAdminRepository: async () => repo }));

function mkPage(contentUpdatedAt: Date): ContentPageRow {
  return {
    slug: "s",
    title: "T",
    content: "",
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
    contentUpdatedAt,
  };
}

describe("admin translations service", () => {
  beforeEach(() => {
    translations = [];
  });

  it("returns null when page is not found", async () => {
    page = null;
    const result = await getPageTranslationsWithStatus("missing");
    expect(result).toBeNull();
  });

  it("status is 'missing' when no translation row", async () => {
    page = mkPage(new Date());
    const s = await getPageTranslationsWithStatus("s");
    expect(s).not.toBeNull();
    expect(s!.statuses.de).toBe("missing");
    expect(s!.statuses.en).toBe("ready");
  });

  it("status is 'draft' when translation_ready=false", async () => {
    page = mkPage(new Date("2025-01-01"));
    translations = [
      {
        slug: "s",
        locale: "de",
        title: "x",
        content: "",
        translationReady: false,
        sourceUpdatedAt: new Date("2025-01-01"),
        updatedAt: new Date("2025-01-02"),
        updatedBy: null,
      },
    ];
    const s = await getPageTranslationsWithStatus("s");
    expect(s).not.toBeNull();
    expect(s!.statuses.de).toBe("draft");
  });

  it("status is 'stale' when source newer than snapshot", async () => {
    page = mkPage(new Date("2025-02-01"));
    translations = [
      {
        slug: "s",
        locale: "de",
        title: "x",
        content: "",
        translationReady: true,
        sourceUpdatedAt: new Date("2025-01-01"),
        updatedAt: new Date("2025-01-02"),
        updatedBy: null,
      },
    ];
    const s = await getPageTranslationsWithStatus("s");
    expect(s).not.toBeNull();
    expect(s!.statuses.de).toBe("stale");
  });

  it("status is 'ready' when up-to-date and ready", async () => {
    page = mkPage(new Date("2025-01-01"));
    translations = [
      {
        slug: "s",
        locale: "de",
        title: "x",
        content: "",
        translationReady: true,
        sourceUpdatedAt: new Date("2025-01-01"),
        updatedAt: new Date("2025-01-02"),
        updatedBy: null,
      },
    ];
    const s = await getPageTranslationsWithStatus("s");
    expect(s).not.toBeNull();
    expect(s!.statuses.de).toBe("ready");
  });

  it("upsert rejects when locale === default-locale", async () => {
    page = mkPage(new Date());
    const res = await upsertPageTranslation(
      "s",
      "en",
      {
        title: "x",
        content: "",
        translationReady: false,
      },
      null,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("INVALID_INPUT");
  });

  it("upsert snapshots parent.content_updated_at", async () => {
    const cu = new Date("2025-03-01");
    page = mkPage(cu);
    const res = await upsertPageTranslation(
      "s",
      "de",
      {
        title: "x",
        content: "",
        translationReady: true,
      },
      null,
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.sourceUpdatedAt?.toISOString()).toBe(cu.toISOString());
  });
});
