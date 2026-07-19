import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getAdminRepository } from "../db/index.js";

describe.skipIf(!process.env.DATABASE_URL)("segment + nav translations repositories (integration)", () => {
  const owner = `it-owner-${Math.random().toString(36).slice(2, 8)}`;
  const child = `it-child-${Math.random().toString(36).slice(2, 8)}`;
  let segmentId = 0;

  // Save and restore footer nav so tests do not mutate real data.
  // (Footer is currently empty in the local DB; this guard is kept for safety.)
  let savedFooterItems: Awaited<ReturnType<Awaited<ReturnType<typeof getAdminRepository>>["listAdminNavItems"]>> = [];
  const savedFooterTranslations: Map<
    number,
    Awaited<ReturnType<Awaited<ReturnType<typeof getAdminRepository>>["listNavTranslations"]>>
  > = new Map();

  beforeAll(async () => {
    const repo = await getAdminRepository();

    // Save current footer nav state.
    savedFooterItems = await repo.listAdminNavItems("footer");
    for (const item of savedFooterItems) {
      const translations = await repo.listNavTranslations("footer");
      savedFooterTranslations.set(
        item.id,
        translations.filter((t) => t.navItemId === item.id),
      );
    }

    // Create test pages.
    await repo.createContentPage({
      slug: child,
      title: "Child",
      status: "published",
      pageType: "default",
      createdBy: null,
    });
    await repo.createContentPage({
      slug: owner,
      title: "Owner",
      status: "published",
      pageType: "segmented",
      createdBy: null,
    });

    // Create the initial segment for this suite.
    const rows = await repo.replaceSegmentsForOwner(owner, [{ position: 0, label: "Child", targetSlug: child }]);
    segmentId = rows[0]!.id;
  });

  afterAll(async () => {
    const repo = await getAdminRepository();

    // Remove test pages (cascades to segments + their translations).
    await repo.deleteContentPage(owner);
    await repo.deleteContentPage(child);

    // Restore footer nav to its original state.
    const restoredItems = await repo.replaceAdminNavItems(
      "footer",
      savedFooterItems.map((item) => ({
        pageSlug: item.pageSlug,
        url: item.url,
        label: item.label,
        target: item.target,
      })),
    );
    for (const restoredItem of restoredItems) {
      const originalItem = savedFooterItems.find((s) => s.position === restoredItem.position);
      if (originalItem) {
        const translations = savedFooterTranslations.get(originalItem.id) ?? [];
        if (translations.length > 0) {
          await repo.replaceNavItemTranslations(
            restoredItem.id,
            translations.map((t) => ({
              locale: t.locale,
              label: t.label,
              sourceUpdatedAt: t.sourceUpdatedAt,
            })),
          );
        }
      }
    }
  });

  beforeEach(async () => {
    const repo = await getAdminRepository();
    await repo.replaceSegmentTranslations(segmentId, []);
  });

  it("replaceSegmentTranslations persists rows and overwrites entire set", async () => {
    const repo = await getAdminRepository();

    await repo.replaceSegmentTranslations(segmentId, [{ locale: "de", label: "Kind", sourceUpdatedAt: new Date() }]);
    const after = await repo.listSegmentTranslationsForOwner(owner);
    expect(after.map((r) => r.locale)).toEqual(["de"]);
    expect(after[0]!.label).toBe("Kind");

    // Empty array wipes all rows.
    await repo.replaceSegmentTranslations(segmentId, []);
    expect(await repo.listSegmentTranslationsForOwner(owner)).toEqual([]);
  });

  it("cascade: deleting the segment removes its translations", async () => {
    const repo = await getAdminRepository();

    await repo.replaceSegmentTranslations(segmentId, [{ locale: "de", label: "Kind", sourceUpdatedAt: null }]);

    // Wipe all segments for the owner (cascades to translations).
    await repo.replaceSegmentsForOwner(owner, []);
    expect(await repo.listSegmentTranslationsForOwner(owner)).toEqual([]);

    // Recreate the segment so subsequent tests and afterAll work correctly.
    const rows = await repo.replaceSegmentsForOwner(owner, [{ position: 0, label: "Child", targetSlug: child }]);
    segmentId = rows[0]!.id;
  });

  it("replaceNavItemTranslations persists per-item/locale", async () => {
    const repo = await getAdminRepository();

    // Insert a scratch footer item.
    const navRows = await repo.replaceAdminNavItems("footer", [
      { pageSlug: null, url: "/x-it", label: "Home", target: "_self" },
    ]);
    const navItemId = navRows[0]!.id;

    await repo.replaceNavItemTranslations(navItemId, [{ locale: "de", label: "Start", sourceUpdatedAt: new Date() }]);

    const rows = await repo.listNavTranslations("footer");
    expect(rows.find((r) => r.navItemId === navItemId)?.label).toBe("Start");

    // Cleanup: wipe the footer back to empty (afterAll will restore to saved state).
    await repo.replaceAdminNavItems("footer", []);
    expect(await repo.listNavTranslations("footer")).toEqual([]);
  });
});
