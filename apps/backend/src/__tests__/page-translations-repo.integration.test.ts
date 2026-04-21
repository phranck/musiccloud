import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getAdminRepository } from "../db/index.js";

describe("page translations repository (integration)", () => {
  const slug = "it-about-" + Math.random().toString(36).slice(2, 8);

  beforeAll(async () => {
    const repo = await getAdminRepository();
    await repo.createContentPage({
      slug,
      title: "About (IT)",
      status: "draft",
      pageType: "default",
      createdBy: null,
    });
    // Seed an English translation to mirror what migration 0018 does for
    // pre-existing pages. New pages do not get an automatic en row on insert.
    await repo.upsertPageTranslation({
      slug,
      locale: "en",
      title: "About (IT)",
      content: "",
      translationReady: true,
      sourceUpdatedAt: null,
      updatedBy: null,
    });
  });

  afterAll(async () => {
    const repo = await getAdminRepository();
    await repo.deleteContentPage(slug);
  });

  beforeEach(async () => {
    const repo = await getAdminRepository();
    await repo.deletePageTranslation(slug, "de");
  });

  it("upsert inserts then updates", async () => {
    const repo = await getAdminRepository();
    const now = new Date();

    const inserted = await repo.upsertPageTranslation({
      slug,
      locale: "de",
      title: "Über uns",
      content: "Hallo",
      translationReady: false,
      sourceUpdatedAt: now,
      updatedBy: null,
    });
    expect(inserted.title).toBe("Über uns");
    expect(inserted.locale).toBe("de");
    expect(inserted.translationReady).toBe(false);

    const updated = await repo.upsertPageTranslation({
      slug,
      locale: "de",
      title: "Über uns 2",
      content: "Hallo2",
      translationReady: true,
      sourceUpdatedAt: now,
      updatedBy: null,
    });
    expect(updated.title).toBe("Über uns 2");
    expect(updated.content).toBe("Hallo2");
    expect(updated.translationReady).toBe(true);
  });

  it("list returns all locales for slug (including en seed)", async () => {
    const repo = await getAdminRepository();
    await repo.upsertPageTranslation({
      slug,
      locale: "de",
      title: "x",
      content: "",
      translationReady: false,
      sourceUpdatedAt: null,
      updatedBy: null,
    });
    const rows = await repo.listPageTranslations(slug);
    expect(rows.map((r) => r.locale).sort()).toEqual(["de", "en"]);
  });

  it("get returns the requested locale or null", async () => {
    const repo = await getAdminRepository();
    const missing = await repo.getPageTranslation(slug, "de");
    expect(missing).toBeNull();

    await repo.upsertPageTranslation({
      slug,
      locale: "de",
      title: "x",
      content: "",
      translationReady: true,
      sourceUpdatedAt: null,
      updatedBy: null,
    });
    const present = await repo.getPageTranslation(slug, "de");
    expect(present?.title).toBe("x");
  });

  it("delete returns true only when a row was removed", async () => {
    const repo = await getAdminRepository();
    await repo.upsertPageTranslation({
      slug,
      locale: "de",
      title: "x",
      content: "",
      translationReady: false,
      sourceUpdatedAt: null,
      updatedBy: null,
    });
    expect(await repo.deletePageTranslation(slug, "de")).toBe(true);
    expect(await repo.deletePageTranslation(slug, "de")).toBe(false);
  });

  it("setContentPageContentUpdatedAt bumps the column", async () => {
    const repo = await getAdminRepository();
    const before = await repo.getContentPageBySlug(slug);
    const t = new Date(before!.contentUpdatedAt.getTime() + 60_000);
    await repo.setContentPageContentUpdatedAt(slug, t);
    const after = await repo.getContentPageBySlug(slug);
    expect(after!.contentUpdatedAt.getTime()).toBe(t.getTime());
  });

  it("cascade: deleting the page removes its translations", async () => {
    const repo = await getAdminRepository();
    const scratch = "it-cascade-" + Math.random().toString(36).slice(2, 8);
    await repo.createContentPage({
      slug: scratch,
      title: "Cascade",
      status: "draft",
      pageType: "default",
      createdBy: null,
    });
    await repo.upsertPageTranslation({
      slug: scratch,
      locale: "de",
      title: "x",
      content: "",
      translationReady: true,
      sourceUpdatedAt: null,
      updatedBy: null,
    });
    await repo.deleteContentPage(scratch);
    expect(await repo.listPageTranslations(scratch)).toEqual([]);
  });
});
