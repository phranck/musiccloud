import { ContentContext, NavigationArea } from "@musiccloud/shared";
import { describe, expect, it, vi } from "vitest";

import type { AdminRepository } from "../db/admin-repository.js";

function placement(context: number, area: number, position = 0) {
  return { context, area, position };
}

function urlEntry(overrides: Record<string, unknown> = {}) {
  return {
    targetKind: "url",
    pageId: null,
    url: "/about",
    systemKey: null,
    target: "_self",
    label: "About",
    contextMask: ContentContext.Frontend,
    areaMask: NavigationArea.Main,
    placements: [placement(ContentContext.Frontend, NavigationArea.Main)],
    ...overrides,
  };
}

function systemEntry(
  systemKey: "docs" | "api-reference" | "search",
  areaMask = NavigationArea.Main,
  placements = [placement(ContentContext.DeveloperPortal, NavigationArea.Main)],
) {
  return {
    targetKind: "system",
    pageId: null,
    url: null,
    systemKey,
    target: "_self",
    label: systemKey,
    contextMask: ContentContext.DeveloperPortal,
    areaMask,
    placements,
  };
}

const SYSTEM_KEYS = ["docs", "api-reference", "search"] as const;

function completeSystemEntries(replacement?: ReturnType<typeof systemEntry>) {
  return SYSTEM_KEYS.map((systemKey, index) =>
    replacement?.systemKey === systemKey
      ? replacement
      : systemEntry(systemKey, NavigationArea.Main, [
          placement(ContentContext.DeveloperPortal, NavigationArea.Main, 10 + index),
        ]),
  );
}

async function loadService(
  options: { pageContextMask?: number; pagePublications?: Array<{ context: number; path: string }> } = {},
) {
  const replaceNavigationConfiguration = vi.fn(async (entries: unknown[]) =>
    entries.map((entry, index) => ({ id: index + 1, ...(entry as object) })),
  );
  const repo = {
    getContentPageById: vi.fn(async () =>
      options.pageContextMask === undefined
        ? null
        : {
            id: "page-1",
            contextMask: options.pageContextMask,
            publications: options.pagePublications ?? [],
          },
    ),
    replaceNavigationConfiguration,
  } as unknown as AdminRepository;

  vi.doMock("../db/index.js", () => ({ getAdminRepository: async () => repo }));
  vi.resetModules();
  const service = await import("../services/admin-nav.js");
  return { replaceNavigationConfiguration, service };
}

describe("contextual navigation validation", () => {
  it.each([
    ["contextMask", 0],
    ["contextMask", 4],
    ["areaMask", 0],
    ["areaMask", 4],
  ])("rejects invalid %s value %s before persistence", async (field, value) => {
    const { replaceNavigationConfiguration, service } = await loadService();

    const result = await service.replaceManagedNavigationConfiguration({
      entries: [urlEntry({ [field]: value })],
    });

    expect(result).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(replaceNavigationConfiguration).not.toHaveBeenCalled();
  });

  it("rejects a missing placement from the required Cartesian product", async () => {
    const { replaceNavigationConfiguration, service } = await loadService();

    const result = await service.replaceManagedNavigationConfiguration({
      entries: [
        urlEntry({
          areaMask: NavigationArea.Main | NavigationArea.Footer,
          placements: [placement(ContentContext.Frontend, NavigationArea.Main)],
        }),
      ],
    });

    expect(result).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(replaceNavigationConfiguration).not.toHaveBeenCalled();
  });

  it("rejects duplicate positions inside one concrete navigation list", async () => {
    const { replaceNavigationConfiguration, service } = await loadService();

    const result = await service.replaceManagedNavigationConfiguration({
      entries: [urlEntry(), urlEntry({ url: "/contact" })],
    });

    expect(result).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(replaceNavigationConfiguration).not.toHaveBeenCalled();
  });

  it("rejects a page target whose contexts are not supported by the page", async () => {
    const { replaceNavigationConfiguration, service } = await loadService({
      pageContextMask: ContentContext.Frontend,
    });

    const result = await service.replaceManagedNavigationConfiguration({
      entries: [
        urlEntry({
          targetKind: "page",
          pageId: "page-1",
          url: null,
          contextMask: ContentContext.Frontend | ContentContext.DeveloperPortal,
          placements: [
            placement(ContentContext.Frontend, NavigationArea.Main),
            placement(ContentContext.DeveloperPortal, NavigationArea.Main),
          ],
        }),
      ],
    });

    expect(result).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(replaceNavigationConfiguration).not.toHaveBeenCalled();
  });

  it("rejects a Page target that claims the protected docs namespace in any context", async () => {
    const { replaceNavigationConfiguration, service } = await loadService({
      pageContextMask: ContentContext.Frontend,
      pagePublications: [{ context: ContentContext.Frontend, path: "/docs/forged" }],
    });

    const result = await service.replaceManagedNavigationConfiguration({
      entries: [
        urlEntry({
          targetKind: "page",
          pageId: "page-1",
          url: null,
          contextMask: ContentContext.Frontend,
          placements: [placement(ContentContext.Frontend, NavigationArea.Main)],
        }),
      ],
    });

    expect(result).toMatchObject({
      ok: false,
      code: "INVALID_INPUT",
      message: expect.stringContaining("docs namespace"),
    });
    expect(replaceNavigationConfiguration).not.toHaveBeenCalled();
  });

  it.each([
    "docs",
    "api-reference",
    "search",
  ] as const)("accepts protected system target %s in Developer Portal Main and Footer", async (systemKey) => {
    const { replaceNavigationConfiguration, service } = await loadService();
    const entry = systemEntry(systemKey, NavigationArea.Main | NavigationArea.Footer, [
      placement(ContentContext.DeveloperPortal, NavigationArea.Main, 2),
      placement(ContentContext.DeveloperPortal, NavigationArea.Footer, 0),
    ]);

    const entries = completeSystemEntries(entry);
    const result = await service.replaceManagedNavigationConfiguration({ entries });

    expect(result.ok).toBe(true);
    expect(replaceNavigationConfiguration).toHaveBeenCalledWith(entries);
  });

  it("rejects protected system targets outside the Developer Portal", async () => {
    const { replaceNavigationConfiguration, service } = await loadService();

    const result = await service.replaceManagedNavigationConfiguration({
      entries: [
        systemEntry("docs", NavigationArea.Main, [placement(ContentContext.Frontend, NavigationArea.Main)]),
      ].map((entry) => ({ ...entry, contextMask: ContentContext.Frontend })),
    });

    expect(result).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(replaceNavigationConfiguration).not.toHaveBeenCalled();
  });

  it("rejects unknown and duplicate system keys", async () => {
    const first = await loadService();
    const unknown = await first.service.replaceManagedNavigationConfiguration({
      entries: [{ ...systemEntry("docs"), systemKey: "forged" }],
    });
    expect(unknown).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(first.replaceNavigationConfiguration).not.toHaveBeenCalled();

    const second = await loadService();
    const duplicate = await second.service.replaceManagedNavigationConfiguration({
      entries: [systemEntry("docs"), systemEntry("docs", NavigationArea.Footer, [placement(2, 2)])],
    });
    expect(duplicate).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(second.replaceNavigationConfiguration).not.toHaveBeenCalled();
  });

  it("rejects editable route or browser-target fields for system entries", async () => {
    const first = await loadService();
    await expect(
      first.service.replaceManagedNavigationConfiguration({
        entries: [{ ...systemEntry("api-reference"), url: "/different" }],
      }),
    ).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });

    const second = await loadService();
    await expect(
      second.service.replaceManagedNavigationConfiguration({
        entries: [{ ...systemEntry("search"), target: "_blank" }],
      }),
    ).resolves.toMatchObject({ ok: false, code: "INVALID_INPUT" });
  });

  it("rejects normal URL targets that claim the protected docs namespace", async () => {
    const { replaceNavigationConfiguration, service } = await loadService();

    for (const url of ["/docs", "/docs/api", "/docs/guides/authentication"] as const) {
      const result = await service.replaceManagedNavigationConfiguration({ entries: [urlEntry({ url })] });
      expect(result).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    }
    expect(replaceNavigationConfiguration).not.toHaveBeenCalled();
  });

  it("rejects removal of any protected system identity", async () => {
    const { replaceNavigationConfiguration, service } = await loadService();

    const result = await service.replaceManagedNavigationConfiguration({
      entries: completeSystemEntries().filter((entry) => entry.systemKey !== "search"),
    });

    expect(result).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(replaceNavigationConfiguration).not.toHaveBeenCalled();
  });

  it("ignores forged system routes and behavior in favor of code-owned descriptors", async () => {
    const { service } = await loadService();
    const entries = completeSystemEntries({
      ...systemEntry("search"),
      canonicalRoute: "/forged",
      behavior: "navigate",
    });

    const result = await service.replaceManagedNavigationConfiguration({ entries });

    expect(result).toMatchObject({
      ok: true,
      data: {
        entries: [
          expect.anything(),
          expect.anything(),
          expect.objectContaining({ canonicalRoute: "/docs/api?search=1", behavior: "open-api-search" }),
        ],
      },
    });
  });

  it("persists only the canonical label", async () => {
    const { replaceNavigationConfiguration, service } = await loadService();
    const url = urlEntry({ translations: { en: "About", de: "Über uns" } });
    const entries = [url, ...completeSystemEntries()];

    const result = await service.replaceManagedNavigationConfiguration({
      entries,
    });

    expect(result.ok).toBe(true);
    const persisted = replaceNavigationConfiguration.mock.calls[0]![0];
    expect(persisted[0]).toMatchObject({ label: "About" });
    expect(persisted[0]).not.toHaveProperty("translations");
  });
});
