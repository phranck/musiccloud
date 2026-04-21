import { describe, expect, it, vi } from "vitest";

import type { AdminRepository, NavItemRow } from "../db/admin-repository.js";

describe("nav bulk replace with translations", () => {
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
