import { ContentContext, NavigationArea } from "@musiccloud/shared";
import { describe, expect, it, vi } from "vitest";

import type { AdminRepository } from "../db/admin-repository.js";

describe("legacy navigation writes", () => {
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
    };

    vi.doMock("../db/index.js", () => ({ getAdminRepository: async () => scopedRepo }));
    vi.resetModules();
    const { replaceManagedNavItems } = await import("../services/admin-nav.js");

    const result = await replaceManagedNavItems("header", [{ url: "/new", label: "New", target: "_self" }]);

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
      }),
    ]);
  });
});
