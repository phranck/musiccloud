import { ContentContext } from "@musiccloud/shared";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { applyContentPublicationCutover, getPublishedContentPageByPath } from "./postgres-content-pages.js";

interface CutoverInput {
  sourceSlug: string;
  pageId: string;
  publication: {
    context: typeof ContentContext.DeveloperPortal;
    path: string;
    status: "published";
    templateKey: "developer-default";
  };
}

const CUTOVER_INPUTS: CutoverInput[] = [
  {
    sourceSlug: "privacy",
    pageId: "page-privacy-stable",
    publication: {
      context: ContentContext.DeveloperPortal,
      path: "/privacy",
      status: "published",
      templateKey: "developer-default",
    },
  },
  {
    sourceSlug: "terms",
    pageId: "page-terms-stable",
    publication: {
      context: ContentContext.DeveloperPortal,
      path: "/terms",
      status: "published",
      templateKey: "developer-default",
    },
  },
];

interface SqlPublicationRow {
  page_id: string;
  context: number;
  path: string;
  status: string;
  template_key: string;
}

function publicationRow(pageId: string, context: number, path: string): SqlPublicationRow {
  return {
    page_id: pageId,
    context,
    path,
    status: "published",
    template_key: context === ContentContext.Frontend ? "frontend-default" : "developer-default",
  };
}

function createCutoverPool(options: {
  pages?: Array<{ id: string; slug: string }>;
  publications: SqlPublicationRow[];
  failInsertAt?: number;
}): { calls: Array<{ sql: string; params: unknown[] | undefined }>; pool: Pool } {
  const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
  let insertCount = 0;
  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (sql.includes("FROM content_pages") && sql.includes("FOR UPDATE")) {
        return {
          rows: options.pages ?? [
            { id: "page-privacy-stable", slug: "privacy" },
            { id: "page-terms-stable", slug: "terms" },
          ],
        };
      }
      if (sql.includes("FROM content_page_publications") && sql.includes("FOR UPDATE")) {
        return { rows: options.publications };
      }
      if (sql.includes("INSERT INTO content_page_publications")) {
        insertCount++;
        if (insertCount === options.failInsertAt) throw new Error("simulated second insert failure");
        return {
          rows: [
            {
              page_id: params?.[0],
              context: params?.[1],
              path: params?.[2],
              status: params?.[3],
              template_key: params?.[4],
            },
          ],
        };
      }
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  return {
    calls,
    pool: { connect: vi.fn().mockResolvedValue(client) } as unknown as Pool,
  };
}

describe("getPublishedContentPageByPath", () => {
  it.each([
    "/docs",
    "/docs/crawler-architecture",
    "//docs//sdks/swift/",
  ])("does not query editorial persistence for reserved Developer Portal path %s", async (path) => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;

    await expect(getPublishedContentPageByPath(pool, ContentContext.DeveloperPortal, path)).resolves.toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it("keeps /docs available to the independent Frontend context", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;

    await expect(getPublishedContentPageByPath(pool, ContentContext.Frontend, "/docs")).resolves.toBeNull();
    expect(query).toHaveBeenCalledOnce();
  });
});

describe("applyContentPublicationCutover", () => {
  it("locks and revalidates once, then inserts missing publications without deleting unrelated rows", async () => {
    const { calls, pool } = createCutoverPool({
      publications: [
        publicationRow("page-privacy-stable", ContentContext.Frontend, "/privacy"),
        publicationRow("page-terms-stable", ContentContext.Frontend, "/terms"),
        publicationRow("unrelated-page", ContentContext.Frontend, "/pricing"),
      ],
    });

    await expect(applyContentPublicationCutover(pool, CUTOVER_INPUTS)).resolves.toEqual([
      {
        pageId: "page-privacy-stable",
        context: ContentContext.DeveloperPortal,
        path: "/privacy",
        status: "published",
        templateKey: "developer-default",
      },
      {
        pageId: "page-terms-stable",
        context: ContentContext.DeveloperPortal,
        path: "/terms",
        status: "published",
        templateKey: "developer-default",
      },
    ]);

    expect(calls[0]?.sql).toBe("BEGIN");
    expect(calls.some(({ sql }) => sql.includes("LOCK TABLE content_page_publications"))).toBe(true);
    expect(calls.some(({ sql }) => sql.includes("FROM content_pages") && sql.includes("FOR UPDATE"))).toBe(true);
    expect(calls.some(({ sql }) => sql.includes("FROM content_page_publications") && sql.includes("FOR UPDATE"))).toBe(
      true,
    );
    expect(calls.filter(({ sql }) => sql.includes("INSERT INTO content_page_publications"))).toHaveLength(2);
    expect(calls.some(({ sql }) => /\bDELETE\b/.test(sql))).toBe(false);
    expect(calls.at(-1)?.sql).toBe("COMMIT");
  });

  it("revalidates target routes under lock and rolls back before inserts when a concurrent claim exists", async () => {
    const { calls, pool } = createCutoverPool({
      publications: [
        publicationRow("page-privacy-stable", ContentContext.Frontend, "/privacy"),
        publicationRow("page-terms-stable", ContentContext.Frontend, "/terms"),
        publicationRow("concurrent-owner", ContentContext.DeveloperPortal, "/terms"),
      ],
    });

    await expect(applyContentPublicationCutover(pool, CUTOVER_INPUTS)).rejects.toThrow(/conflict/i);
    expect(calls.filter(({ sql }) => sql.includes("INSERT INTO content_page_publications"))).toHaveLength(0);
    expect(calls.some(({ sql }) => sql === "ROLLBACK")).toBe(true);
    expect(calls.some(({ sql }) => sql === "COMMIT")).toBe(false);
  });

  it("revalidates stable Page identities under lock before inserting", async () => {
    const { calls, pool } = createCutoverPool({
      pages: [
        { id: "page-privacy-stable", slug: "privacy-renamed" },
        { id: "page-terms-stable", slug: "terms" },
      ],
      publications: [
        publicationRow("page-privacy-stable", ContentContext.Frontend, "/privacy"),
        publicationRow("page-terms-stable", ContentContext.Frontend, "/terms"),
      ],
    });

    await expect(applyContentPublicationCutover(pool, CUTOVER_INPUTS)).rejects.toThrow(/conflict/i);
    expect(calls.filter(({ sql }) => sql.includes("INSERT INTO content_page_publications"))).toHaveLength(0);
    expect(calls.some(({ sql }) => sql === "ROLLBACK")).toBe(true);
  });

  it("revalidates reserved docs claims under lock and rolls back without inserts", async () => {
    const { calls, pool } = createCutoverPool({
      publications: [
        publicationRow("page-privacy-stable", ContentContext.Frontend, "/privacy"),
        publicationRow("page-terms-stable", ContentContext.Frontend, "/terms"),
        publicationRow("docs-owner", ContentContext.DeveloperPortal, "/docs/api"),
      ],
    });

    await expect(applyContentPublicationCutover(pool, CUTOVER_INPUTS)).rejects.toThrow(/conflict/i);
    expect(calls.filter(({ sql }) => sql.includes("INSERT INTO content_page_publications"))).toHaveLength(0);
    expect(calls.some(({ sql }) => sql === "ROLLBACK")).toBe(true);
  });

  it("rolls back the entire transaction when the second insert fails", async () => {
    const { calls, pool } = createCutoverPool({
      publications: [
        publicationRow("page-privacy-stable", ContentContext.Frontend, "/privacy"),
        publicationRow("page-terms-stable", ContentContext.Frontend, "/terms"),
      ],
      failInsertAt: 2,
    });

    await expect(applyContentPublicationCutover(pool, CUTOVER_INPUTS)).rejects.toThrow(
      "simulated second insert failure",
    );
    expect(calls.filter(({ sql }) => sql.includes("INSERT INTO content_page_publications"))).toHaveLength(2);
    expect(calls.some(({ sql }) => sql === "ROLLBACK")).toBe(true);
    expect(calls.some(({ sql }) => sql === "COMMIT")).toBe(false);
  });

  it("treats exact locked target publications as an idempotent no-op", async () => {
    const { calls, pool } = createCutoverPool({
      publications: [
        publicationRow("page-privacy-stable", ContentContext.Frontend, "/privacy"),
        publicationRow("page-privacy-stable", ContentContext.DeveloperPortal, "/privacy"),
        publicationRow("page-terms-stable", ContentContext.Frontend, "/terms"),
        publicationRow("page-terms-stable", ContentContext.DeveloperPortal, "/terms"),
      ],
    });

    await expect(applyContentPublicationCutover(pool, CUTOVER_INPUTS)).resolves.toEqual([]);
    expect(calls.filter(({ sql }) => sql.includes("INSERT INTO content_page_publications"))).toHaveLength(0);
    expect(calls.at(-1)?.sql).toBe("COMMIT");
  });

  it("rolls back a mismatching locked target publication without overwriting it", async () => {
    const mismatchingPrivacy = publicationRow("page-privacy-stable", ContentContext.DeveloperPortal, "/privacy");
    mismatchingPrivacy.status = "draft";
    const { calls, pool } = createCutoverPool({
      publications: [
        publicationRow("page-privacy-stable", ContentContext.Frontend, "/privacy"),
        mismatchingPrivacy,
        publicationRow("page-terms-stable", ContentContext.Frontend, "/terms"),
      ],
    });

    await expect(applyContentPublicationCutover(pool, CUTOVER_INPUTS)).rejects.toThrow(/conflict/i);
    expect(calls.filter(({ sql }) => sql.includes("INSERT INTO content_page_publications"))).toHaveLength(0);
    expect(calls.some(({ sql }) => /\bDELETE\b|\bUPDATE content_page_publications\b/.test(sql))).toBe(false);
    expect(calls.some(({ sql }) => sql === "ROLLBACK")).toBe(true);
  });
});
