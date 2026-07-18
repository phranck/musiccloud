import { ContentContext, PageType } from "@musiccloud/shared";
import { describe, expect, it, vi } from "vitest";
import type { AdminRepository, ContentPageSummaryRow } from "../db/admin-repository.js";
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

describe("backfillContextualContent", () => {
  it("plans an idempotent dry run without writing", async () => {
    const replace = vi.fn();
    const repo = {
      listContentPageSummaries: async () => [page()],
      replaceContentPublications: replace,
    } as unknown as AdminRepository;

    const result = await backfillContextualContent(repo, { dryRun: true });

    expect(result).toEqual({ pages: 1, publications: 1, conflicts: 0, writes: 0 });
    expect(formatBackfillSummary(result)).toBe("pages=1 publications=1 conflicts=0 writes=0");
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
});
