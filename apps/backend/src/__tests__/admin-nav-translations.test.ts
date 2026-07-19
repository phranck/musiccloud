import { ContentContext, NavigationArea } from "@musiccloud/shared";
import { describe, expect, it, vi } from "vitest";

import type { AdminRepository, NavItemRow } from "../db/admin-repository.js";

describe("nav bulk replace with translations", () => {
  it("revalidates a matched legacy Page against the protected docs namespace", async () => {
    const replaceNavigationConfiguration = vi.fn();
    const scopedRepo: Partial<AdminRepository> = {
      async listNavigationConfiguration() {
        return [
          {
            id: 9,
            targetKind: "page",
            pageId: "page-legacy",
            pageSlug: "legacy-docs",
            pageTitle: "Legacy docs",
            url: null,
            systemKey: null,
            target: "_self",
            label: "Legacy docs",
            contextMask: ContentContext.Frontend,
            areaMask: NavigationArea.Main,
            placements: [{ context: ContentContext.Frontend, area: NavigationArea.Main, position: 0 }],
            translations: {},
            labelUpdatedAt: new Date("2026-07-18T08:00:00.000Z"),
          },
        ];
      },
      async getContentPageBySlug() {
        return {
          id: "page-legacy",
          contextMask: ContentContext.Frontend,
          publications: [{ context: ContentContext.Frontend, path: "/docs/legacy" }],
        } as never;
      },
      replaceNavigationConfiguration,
    };

    vi.doMock("../db/index.js", () => ({ getAdminRepository: async () => scopedRepo }));
    vi.resetModules();
    const { replaceManagedNavItems } = await import("../services/admin-nav.js");

    const result = await replaceManagedNavItems("header", [{ pageSlug: "legacy-docs", label: "Legacy docs" }]);

    expect(result).toMatchObject({
      ok: false,
      code: "INVALID_INPUT",
      message: expect.stringContaining("docs namespace"),
    });
    expect(replaceNavigationConfiguration).not.toHaveBeenCalled();
  });

  it("rejects a legacy Frontend placement for a Developer-Portal-only page", async () => {
    const replaceNavigationConfiguration = vi.fn();
    const scopedRepo: Partial<AdminRepository> = {
      async listNavigationConfiguration() {
        return [
          {
            id: 1,
            targetKind: "system",
            pageId: null,
            pageSlug: null,
            pageTitle: null,
            url: null,
            systemKey: "docs",
            target: "_self",
            label: "Docs",
            contextMask: ContentContext.DeveloperPortal,
            areaMask: NavigationArea.Main,
            placements: [{ context: ContentContext.DeveloperPortal, area: NavigationArea.Main, position: 0 }],
            translations: {},
            labelUpdatedAt: new Date("2026-07-18T08:00:00.000Z"),
          },
        ];
      },
      async getContentPageBySlug() {
        return { id: "page-docs", contextMask: ContentContext.DeveloperPortal } as never;
      },
      replaceNavigationConfiguration,
    };

    vi.doMock("../db/index.js", () => ({ getAdminRepository: async () => scopedRepo }));
    vi.resetModules();
    const { replaceManagedNavItems } = await import("../services/admin-nav.js");

    const result = await replaceManagedNavItems("header", [{ pageSlug: "developer-guide", label: "Guide" }]);

    expect(result).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(replaceNavigationConfiguration).not.toHaveBeenCalled();
  });

  it("preserves Developer Portal system targets when the legacy header route writes Frontend Main", async () => {
    const replaceAdminNavItems = vi.fn();
    const replaceNavigationConfiguration = vi.fn(async (entries) => entries);
    const labelUpdatedAt = new Date("2026-07-18T08:00:00.000Z");
    const scopedRepo: Partial<AdminRepository> = {
      async listNavigationConfiguration() {
        return [
          {
            id: 1,
            targetKind: "system",
            pageId: null,
            pageSlug: null,
            pageTitle: null,
            url: null,
            systemKey: "docs",
            target: "_self",
            label: "Documentation",
            contextMask: ContentContext.DeveloperPortal,
            areaMask: NavigationArea.Main,
            placements: [{ context: ContentContext.DeveloperPortal, area: NavigationArea.Main, position: 0 }],
            translations: { de: "Dokumentation" },
            labelUpdatedAt,
          },
          {
            id: 2,
            targetKind: "url",
            pageId: null,
            pageSlug: null,
            pageTitle: null,
            url: "/old",
            systemKey: null,
            target: "_self",
            label: "Old",
            contextMask: ContentContext.Frontend,
            areaMask: NavigationArea.Main,
            placements: [{ context: ContentContext.Frontend, area: NavigationArea.Main, position: 0 }],
            translations: {},
            labelUpdatedAt,
          },
        ];
      },
      replaceAdminNavItems,
      replaceNavigationConfiguration,
      async listAdminNavItems() {
        return [
          {
            id: 3,
            navId: "header",
            pageSlug: null,
            pageTitle: null,
            url: "/new",
            target: "_self",
            label: "New",
            position: 0,
            pageType: null,
            pageDisplayMode: null,
            pageOverlayWidth: null,
            labelUpdatedAt,
          },
        ];
      },
      async listNavTranslations() {
        return [];
      },
    };

    vi.doMock("../db/index.js", () => ({ getAdminRepository: async () => scopedRepo }));
    vi.resetModules();
    const { replaceManagedNavItems } = await import("../services/admin-nav.js");

    const result = await replaceManagedNavItems("header", [
      { url: "/new", label: "New", target: "_self", translations: { de: "Neu" } },
    ]);

    expect(result.ok).toBe(true);
    expect(replaceAdminNavItems).not.toHaveBeenCalled();
    expect(replaceNavigationConfiguration).toHaveBeenCalledWith([
      expect.objectContaining({
        targetKind: "system",
        systemKey: "docs",
        placements: [{ context: ContentContext.DeveloperPortal, area: NavigationArea.Main, position: 0 }],
      }),
      expect.objectContaining({
        targetKind: "url",
        url: "/new",
        contextMask: ContentContext.Frontend,
        areaMask: NavigationArea.Main,
        placements: [{ context: ContentContext.Frontend, area: NavigationArea.Main, position: 0 }],
        translations: { de: "Neu" },
      }),
    ]);
  });

  it("forwards translations to repo.replaceNavItemTranslations", async () => {
    const calls: {
      navItemId: number;
      translations: { locale: string; label: string; sourceUpdatedAt: Date | null }[];
    }[] = [];

    const labelUpdatedAt = new Date("2025-01-01");

    const stubRow: NavItemRow = {
      id: 10,
      navId: "header",
      pageSlug: null,
      pageTitle: null,
      url: "/x",
      target: "_self",
      label: "Home",
      position: 0,
      pageType: null,
      pageDisplayMode: null,
      pageOverlayWidth: null,
      labelUpdatedAt,
    };

    const scopedRepo: Partial<AdminRepository> = {
      async replaceAdminNavItems() {
        return [stubRow];
      },
      async listAdminNavItems() {
        return [];
      },
      async replaceNavItemTranslations(navItemId, translations) {
        calls.push({ navItemId, translations: [...translations] });
      },
      async listNavTranslations() {
        return [];
      },
    };

    vi.doMock("../db/index.js", () => ({ getAdminRepository: async () => scopedRepo }));
    vi.resetModules();

    const { replaceManagedNavItems } = await import("../services/admin-nav.js");

    const result = await replaceManagedNavItems("header", [
      { url: "/x", label: "Home", target: "_self", translations: { de: "Start" } },
    ]);

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      navItemId: 10,
      translations: [{ locale: "de", label: "Start", sourceUpdatedAt: labelUpdatedAt }],
    });
  });

  it("skips default-locale (en) translations", async () => {
    const calls: {
      navItemId: number;
      translations: { locale: string; label: string; sourceUpdatedAt: Date | null }[];
    }[] = [];

    const labelUpdatedAt = new Date("2025-02-01");

    const stubRow: NavItemRow = {
      id: 20,
      navId: "footer",
      pageSlug: null,
      pageTitle: null,
      url: "/about",
      target: "_self",
      label: "About",
      position: 0,
      pageType: null,
      pageDisplayMode: null,
      pageOverlayWidth: null,
      labelUpdatedAt,
    };

    const scopedRepo: Partial<AdminRepository> = {
      async replaceAdminNavItems() {
        return [stubRow];
      },
      async listAdminNavItems() {
        return [];
      },
      async replaceNavItemTranslations(navItemId, translations) {
        calls.push({ navItemId, translations: [...translations] });
      },
      async listNavTranslations() {
        return [];
      },
    };

    vi.doMock("../db/index.js", () => ({ getAdminRepository: async () => scopedRepo }));
    vi.resetModules();

    const { replaceManagedNavItems } = await import("../services/admin-nav.js");

    // "en" is the default locale — must be skipped
    const result = await replaceManagedNavItems("footer", [
      { url: "/about", label: "About", target: "_self", translations: { en: "About", de: "Über uns" } },
    ]);

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    // Only "de" should be forwarded; "en" (default locale) is skipped
    expect(calls[0]!.translations).toEqual([{ locale: "de", label: "Über uns", sourceUpdatedAt: labelUpdatedAt }]);
  });

  it("calls replaceNavItemTranslations with empty array when no translations provided", async () => {
    const calls: {
      navItemId: number;
      translations: { locale: string; label: string; sourceUpdatedAt: Date | null }[];
    }[] = [];

    const stubRow: NavItemRow = {
      id: 30,
      navId: "header",
      pageSlug: null,
      pageTitle: null,
      url: "/x",
      target: "_self",
      label: "X",
      position: 0,
      pageType: null,
      pageDisplayMode: null,
      pageOverlayWidth: null,
      labelUpdatedAt: new Date("2025-03-01"),
    };

    const scopedRepo: Partial<AdminRepository> = {
      async replaceAdminNavItems() {
        return [stubRow];
      },
      async listAdminNavItems() {
        return [];
      },
      async replaceNavItemTranslations(navItemId, translations) {
        calls.push({ navItemId, translations: [...translations] });
      },
      async listNavTranslations() {
        return [];
      },
    };

    vi.doMock("../db/index.js", () => ({ getAdminRepository: async () => scopedRepo }));
    vi.resetModules();

    const { replaceManagedNavItems } = await import("../services/admin-nav.js");

    const result = await replaceManagedNavItems("header", [{ url: "/x", label: "X", target: "_self" }]);

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.translations).toEqual([]);
  });
});
