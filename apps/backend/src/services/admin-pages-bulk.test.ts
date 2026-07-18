import { ContentContext } from "@musiccloud/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAdminRepository } from "../db/index.js";

import { bulkUpdatePages } from "./admin-pages-bulk.js";

vi.mock("../db/index.js", () => ({
  getAdminRepository: vi.fn(),
}));

vi.mock("./admin-content.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./admin-content.js")>();
  return {
    ...actual,
    getManagedContentPages: vi.fn().mockResolvedValue([]),
  };
});

describe("bulkUpdatePages contextual publications", () => {
  beforeEach(() => {
    vi.mocked(getAdminRepository).mockReset();
  });

  it("validates and synchronizes publications for a status-only update", async () => {
    const bulkUpdate = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getAdminRepository).mockResolvedValue({
      listContentPageSummaries: vi.fn().mockResolvedValue([
        {
          slug: "privacy",
          title: "Privacy",
          status: "draft",
          pageType: "default",
          position: 0,
        },
      ]),
      getContentPageBySlug: vi.fn().mockResolvedValue({
        id: "page-1",
        slug: "privacy",
        title: "Privacy",
        content: "# Privacy",
        status: "draft",
        pageType: "default",
        position: 0,
        contextMask: ContentContext.Frontend,
        publications: [
          {
            pageId: "page-1",
            context: ContentContext.Frontend,
            path: "/privacy",
            status: "draft",
            templateKey: "frontend-default",
          },
        ],
      }),
      bulkUpdatePages: bulkUpdate,
    } as never);

    const result = await bulkUpdatePages(
      { pages: [{ slug: "privacy", meta: { status: "published" } }] },
      { updatedBy: "admin-1" },
    );

    expect(result).toEqual({ ok: true, data: [] });
    expect(bulkUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        pages: [
          expect.objectContaining({
            slug: "privacy",
            meta: expect.objectContaining({
              status: "published",
              publications: [
                expect.objectContaining({ context: ContentContext.Frontend, path: "/privacy", status: "published" }),
              ],
            }),
          }),
        ],
      }),
    );
  });

  it("rejects a Developer Portal publication below /docs before the bulk write", async () => {
    const bulkUpdate = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getAdminRepository).mockResolvedValue({
      listContentPageSummaries: vi.fn().mockResolvedValue([
        {
          slug: "privacy",
          title: "Privacy",
          status: "draft",
          pageType: "default",
          position: 0,
        },
      ]),
      getContentPageBySlug: vi.fn().mockResolvedValue({
        id: "page-1",
        slug: "privacy",
        title: "Privacy",
        content: "# Privacy",
        status: "draft",
        pageType: "default",
        position: 0,
        contextMask: ContentContext.Frontend,
        publications: [
          {
            pageId: "page-1",
            context: ContentContext.Frontend,
            path: "/privacy",
            status: "draft",
            templateKey: "frontend-default",
          },
        ],
      }),
      bulkUpdatePages: bulkUpdate,
    } as never);

    const result = await bulkUpdatePages(
      {
        pages: [
          {
            slug: "privacy",
            meta: {
              contextMask: ContentContext.Frontend | ContentContext.DeveloperPortal,
              publications: [
                {
                  context: ContentContext.Frontend,
                  path: "/privacy",
                  status: "draft",
                  templateKey: "frontend-default",
                },
                {
                  context: ContentContext.DeveloperPortal,
                  path: "/docs/crawler-architecture",
                  status: "draft",
                  templateKey: "developer-default",
                },
              ],
            },
          },
        ],
      },
      { updatedBy: "admin-1" },
    );

    expect(result).toEqual({
      ok: false,
      code: "INVALID_INPUT",
      details: [
        {
          section: "pages",
          index: 0,
          message: "Developer Portal path '/docs/crawler-architecture' is reserved",
        },
      ],
    });
    expect(bulkUpdate).not.toHaveBeenCalled();
  });
});
