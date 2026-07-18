import { ContentContext } from "@musiccloud/shared";
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
    pageType: "default",
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
});
