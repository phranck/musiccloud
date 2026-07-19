import { ContentContext, NavigationArea, PageType } from "@musiccloud/shared";
import { describe, expect, it, vi } from "vitest";
import type {
  AdminRepository,
  ContentPageSummaryRow,
  NavigationConfigurationEntryRow,
  NavigationConfigurationReplaceInput,
  NavItemRow,
} from "../db/admin-repository.js";
import { backfillContextualContent, formatBackfillSummary } from "./backfill-contextual-content.js";

function page(overrides: Partial<ContentPageSummaryRow> = {}): ContentPageSummaryRow {
  return {
    id: "page-privacy",
    slug: "privacy",
    contextMask: ContentContext.Frontend,
    publications: [],
    title: "Privacy",
    status: "published",
    showTitle: true,
    titleAlignment: "left",
    pageType: PageType.Default,
    displayMode: "fullscreen",
    overlayWidth: "regular",
    contentCardStyle: "recessed",
    createdBy: null,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: null,
    ...overrides,
  };
}

function navItem(overrides: Partial<NavItemRow> = {}): NavItemRow {
  return {
    id: 10,
    navId: "header",
    pageSlug: null,
    pageTitle: null,
    url: "/about",
    target: "_self",
    label: "About",
    position: 0,
    pageType: null,
    pageDisplayMode: null,
    pageOverlayWidth: null,
    labelUpdatedAt: new Date("2026-07-18T08:00:00.000Z"),
    ...overrides,
  };
}

describe("backfillContextualContent", () => {
  it("plans an idempotent dry run without writing", async () => {
    const replace = vi.fn();
    const repo = {
      listContentPageSummaries: async () => [page()],
      replaceContentPublications: replace,
    } as unknown as AdminRepository;

    const result = await backfillContextualContent(repo, { dryRun: true });

    expect(result).toEqual({
      pages: 1,
      publications: 1,
      navigationEntries: 0,
      navigationPlacements: 0,
      conflicts: 0,
      writes: 0,
    });
    expect(formatBackfillSummary(result)).toBe(
      "pages=1 publications=1 navigationEntries=0 navigationPlacements=0 conflicts=0 writes=0",
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it("writes once and reports zero writes on a second run", async () => {
    const pages = [page()];
    const replace = vi.fn(async (pageId, publications) => {
      pages[0] = page({
        publications: publications.map((publication: object) => ({ pageId, ...publication })),
      });
      return pages[0].publications!;
    });
    const repo = {
      listContentPageSummaries: async () => pages,
      replaceContentPublications: replace,
    } as unknown as AdminRepository;

    await expect(backfillContextualContent(repo, { dryRun: false })).resolves.toMatchObject({ writes: 1 });
    await expect(backfillContextualContent(repo, { dryRun: false })).resolves.toMatchObject({ writes: 0 });
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("aborts all writes when an existing publication conflicts", async () => {
    const replace = vi.fn();
    const repo = {
      listContentPageSummaries: async () => [
        page({ id: "page-a", slug: "privacy" }),
        page({
          id: "page-b",
          slug: "terms",
          publications: [
            {
              pageId: "page-b",
              context: ContentContext.Frontend,
              path: "/privacy",
              status: "published",
              templateKey: "frontend-default",
            },
          ],
        }),
      ],
      replaceContentPublications: replace,
    } as unknown as AdminRepository;

    await expect(backfillContextualContent(repo, { dryRun: false })).rejects.toThrow("conflict");
    expect(replace).not.toHaveBeenCalled();
  });

  it("preflights colliding planned Frontend claims before the first write", async () => {
    const replace = vi.fn();
    const repo = {
      listContentPageSummaries: async () => [
        page({ id: "page-a", slug: "privacy" }),
        page({ id: "page-b", slug: "/privacy/" }),
      ],
      replaceContentPublications: replace,
    } as unknown as AdminRepository;

    await expect(backfillContextualContent(repo, { dryRun: false })).rejects.toThrow("conflict");
    expect(replace).not.toHaveBeenCalled();
  });

  it("preflights canonically duplicate existing claims before the first write", async () => {
    const replace = vi.fn();
    const repo = {
      listContentPageSummaries: async () => [
        page({
          id: "page-a",
          slug: "alpha",
          contextMask: ContentContext.DeveloperPortal,
          publications: [
            {
              pageId: "page-a",
              context: ContentContext.DeveloperPortal,
              path: "/guide",
              status: "draft",
              templateKey: "developer-default",
            },
          ],
        }),
        page({
          id: "page-b",
          slug: "beta",
          contextMask: ContentContext.DeveloperPortal,
          publications: [
            {
              pageId: "page-b",
              context: ContentContext.DeveloperPortal,
              path: "//guide/",
              status: "draft",
              templateKey: "developer-default",
            },
          ],
        }),
      ],
      replaceContentPublications: replace,
    } as unknown as AdminRepository;

    await expect(backfillContextualContent(repo, { dryRun: false })).rejects.toThrow("conflict");
    expect(replace).not.toHaveBeenCalled();
  });

  it("preflights duplicate existing claims owned by the same page", async () => {
    const replace = vi.fn();
    const repo = {
      listContentPageSummaries: async () => [
        page({
          id: "page-a",
          slug: "alpha",
          contextMask: ContentContext.DeveloperPortal,
          publications: [
            {
              pageId: "page-a",
              context: ContentContext.DeveloperPortal,
              path: "/guide",
              status: "draft",
              templateKey: "developer-default",
            },
            {
              pageId: "page-a",
              context: ContentContext.DeveloperPortal,
              path: "//guide/",
              status: "draft",
              templateKey: "developer-default",
            },
          ],
        }),
      ],
      replaceContentPublications: replace,
    } as unknown as AdminRepository;

    await expect(backfillContextualContent(repo, { dryRun: false })).rejects.toThrow("conflict");
    expect(replace).not.toHaveBeenCalled();
  });

  it("reports an existing Developer Portal /docs publication as a dry-run conflict", async () => {
    const replace = vi.fn();
    const repo = {
      listContentPageSummaries: async () => [
        page({
          id: "page-docs",
          slug: "documentation",
          contextMask: ContentContext.DeveloperPortal,
          publications: [
            {
              pageId: "page-docs",
              context: ContentContext.DeveloperPortal,
              path: "/docs/crawler-architecture",
              status: "published",
              templateKey: "developer-default",
            },
          ],
        }),
      ],
      replaceContentPublications: replace,
    } as unknown as AdminRepository;

    await expect(backfillContextualContent(repo, { dryRun: true })).resolves.toEqual({
      pages: 1,
      publications: 1,
      navigationEntries: 0,
      navigationPlacements: 0,
      conflicts: 1,
      writes: 0,
    });
    expect(replace).not.toHaveBeenCalled();
  });

  it("aborts apply before writes for an existing Developer Portal /docs publication", async () => {
    const replace = vi.fn();
    const repo = {
      listContentPageSummaries: async () => [
        page({
          id: "page-docs",
          slug: "documentation",
          contextMask: ContentContext.DeveloperPortal,
          publications: [
            {
              pageId: "page-docs",
              context: ContentContext.DeveloperPortal,
              path: "/docs",
              status: "draft",
              templateKey: "developer-default",
            },
          ],
        }),
      ],
      replaceContentPublications: replace,
    } as unknown as AdminRepository;

    await expect(backfillContextualContent(repo, { dryRun: false })).rejects.toThrow("conflict");
    expect(replace).not.toHaveBeenCalled();
  });

  it("reports an existing Frontend /docs publication as a system-owned namespace conflict", async () => {
    const replace = vi.fn();
    const repo = {
      listContentPageSummaries: async () => [
        page({
          id: "page-docs",
          slug: "docs/guides",
          publications: [
            {
              pageId: "page-docs",
              context: ContentContext.Frontend,
              path: "/docs/guides",
              status: "published",
              templateKey: "frontend-default",
            },
          ],
        }),
      ],
      replaceContentPublications: replace,
    } as unknown as AdminRepository;

    await expect(backfillContextualContent(repo, { dryRun: true })).resolves.toMatchObject({ conflicts: 1 });
    expect(replace).not.toHaveBeenCalled();
  });

  it("rejects a planned legacy Frontend publication inside the system-owned /docs namespace", async () => {
    const replace = vi.fn();
    const repo = {
      listContentPageSummaries: async () => [page({ id: "page-docs", slug: "docs" })],
      replaceContentPublications: replace,
    } as unknown as AdminRepository;

    await expect(backfillContextualContent(repo, { dryRun: false })).rejects.toThrow("conflict");
    expect(replace).not.toHaveBeenCalled();
  });

  it.each([
    [PageType.Default, "frontend-default"],
    [PageType.Segmented, "frontend-segmented"],
  ])("derives the %s presentation as %s", async (pageType, templateKey) => {
    const replace = vi.fn().mockResolvedValue([]);
    const repo = {
      listContentPageSummaries: async () => [page({ pageType })],
      replaceContentPublications: replace,
    } as unknown as AdminRepository;

    await backfillContextualContent(repo, { dryRun: false });

    expect(replace).toHaveBeenCalledWith("page-privacy", [expect.objectContaining({ templateKey })]);
  });

  it("backfills legacy header/footer navigation and seeds protected portal targets once", async () => {
    const pages = [page()];
    let storedNavigation: NavigationConfigurationEntryRow[] = [];
    const replaceContentPublications = vi.fn(async (pageId, publications) => {
      pages[0] = page({ publications: publications.map((publication: object) => ({ pageId, ...publication })) });
      return pages[0]!.publications!;
    });
    const replaceNavigationConfiguration = vi.fn(async (entries: NavigationConfigurationReplaceInput[]) => {
      storedNavigation = entries.map((entry, index) => ({
        ...entry,
        id: index + 1,
        pageSlug: entry.pageId === "page-privacy" ? "privacy" : null,
        pageTitle: entry.pageId === "page-privacy" ? "Privacy" : null,
        labelUpdatedAt: new Date("2026-07-18T08:00:00.000Z"),
      }));
      return storedNavigation;
    });
    const repo = {
      listContentPageSummaries: async () => pages,
      replaceContentPublications,
      listNavigationConfiguration: async () => storedNavigation,
      listAdminNavItems: async (navId: "header" | "footer") =>
        navId === "header"
          ? [navItem({ pageSlug: "privacy", url: null, label: "Privacy" })]
          : [navItem({ id: 11, navId: "footer", url: "https://status.musiccloud.io", label: "Status" })],
      replaceNavigationConfiguration,
    } as unknown as AdminRepository;

    await expect(backfillContextualContent(repo, { dryRun: false })).resolves.toMatchObject({
      navigationEntries: 5,
      navigationPlacements: 5,
      conflicts: 0,
      writes: 2,
    });
    await expect(backfillContextualContent(repo, { dryRun: false })).resolves.toMatchObject({ writes: 0 });

    expect(replaceNavigationConfiguration).toHaveBeenCalledTimes(1);
    const written = replaceNavigationConfiguration.mock.calls[0]![0];
    expect(written[0]).toMatchObject({
      targetKind: "page",
      pageId: "page-privacy",
      contextMask: ContentContext.Frontend,
      areaMask: NavigationArea.Main,
    });
    expect(written.slice(-3)).toEqual([
      expect.objectContaining({ systemKey: "docs", label: "Docs", placements: [expect.objectContaining({ position: 0 })] }),
      expect.objectContaining({
        systemKey: "api-reference",
        label: "API reference",
        placements: [expect.objectContaining({ position: 1 })],
      }),
      expect.objectContaining({ systemKey: "search", label: "Search", placements: [expect.objectContaining({ position: 2 })] }),
    ]);
  });

  it("preflights protected docs URLs before either content or navigation writes", async () => {
    const replaceContentPublications = vi.fn();
    const replaceNavigationConfiguration = vi.fn();
    const repo = {
      listContentPageSummaries: async () => [
        page({
          publications: [
            {
              pageId: "page-privacy",
              context: ContentContext.Frontend,
              path: "/privacy",
              status: "published",
              templateKey: "frontend-default",
            },
          ],
        }),
      ],
      replaceContentPublications,
      listNavigationConfiguration: async () => [],
      listAdminNavItems: async (navId: "header" | "footer") =>
        navId === "header" ? [navItem({ url: "/docs", label: "Forged docs" })] : [],
      replaceNavigationConfiguration,
    } as unknown as AdminRepository;

    await expect(backfillContextualContent(repo, { dryRun: false })).rejects.toThrow("conflict");
    expect(replaceContentPublications).not.toHaveBeenCalled();
    expect(replaceNavigationConfiguration).not.toHaveBeenCalled();
  });

  it("treats an unresolved legacy page target as a conflict", async () => {
    const replaceNavigationConfiguration = vi.fn();
    const repo = {
      listContentPageSummaries: async () => [page()],
      replaceContentPublications: vi.fn(),
      listNavigationConfiguration: async () => [],
      listAdminNavItems: async (navId: "header" | "footer") =>
        navId === "header" ? [navItem({ pageSlug: "missing", url: null })] : [],
      replaceNavigationConfiguration,
    } as unknown as AdminRepository;

    await expect(backfillContextualContent(repo, { dryRun: true })).resolves.toMatchObject({ conflicts: 1 });
    expect(replaceNavigationConfiguration).not.toHaveBeenCalled();
  });
});
