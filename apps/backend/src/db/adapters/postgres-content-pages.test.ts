import { createHash } from "node:crypto";

import { ContentContext } from "@musiccloud/shared";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { ContentPublicationCutoverInput } from "../admin-repository.js";
import { applyContentPublicationCutover, getPublishedContentPageByPath } from "./postgres-content-pages.js";

const TERMS_PLACEHOLDER =
  "The full Terms of Service for the musiccloud developer portal and API are being finalised and will be published here before public API access opens. Until then, this page is a placeholder.";

function fingerprint(title: string, content: string): string {
  return createHash("sha256").update(JSON.stringify({ title, content })).digest("hex");
}

const CUTOVER_INPUTS: ContentPublicationCutoverInput[] = [
  {
    sourceSlug: "privacy",
    expectedPage: {
      kind: "existing",
      pageId: "page-privacy-stable",
      fingerprint: fingerprint("Privacy Policy", "Canonical privacy body"),
    },
    prerequisitePublications: [
      {
        context: ContentContext.Frontend,
        path: "/privacy",
        status: "published",
        templateKey: "frontend-default",
      },
    ],
    publications: [
      {
        context: ContentContext.DeveloperPortal,
        path: "/privacy",
        status: "published",
        templateKey: "developer-default",
      },
    ],
  },
  {
    sourceSlug: "terms",
    expectedPage: {
      kind: "existing",
      pageId: "page-terms-stable",
      fingerprint: fingerprint("Terms of Service", "Canonical terms body"),
    },
    prerequisitePublications: [],
    publications: [
      {
        context: ContentContext.Frontend,
        path: "/terms",
        status: "published",
        templateKey: "frontend-default",
      },
      {
        context: ContentContext.DeveloperPortal,
        path: "/terms",
        status: "published",
        templateKey: "developer-default",
      },
    ],
  },
];

const BOOTSTRAP_INPUTS: ContentPublicationCutoverInput[] = [
  CUTOVER_INPUTS[0]!,
  {
    sourceSlug: "terms",
    expectedPage: {
      kind: "absent",
      fingerprint: fingerprint("Terms of Service", TERMS_PLACEHOLDER),
      create: {
        title: "Terms of Service",
        content: TERMS_PLACEHOLDER,
        contextMask: ContentContext.Frontend | ContentContext.DeveloperPortal,
        status: "published",
        showTitle: true,
        titleAlignment: "left",
        pageType: "default",
        displayMode: "fullscreen",
        overlayWidth: "regular",
        contentCardStyle: "default",
      },
    },
    prerequisitePublications: [],
    publications: CUTOVER_INPUTS[1]!.publications,
  },
];

function cloneCutoverInputs(): ContentPublicationCutoverInput[] {
  return CUTOVER_INPUTS.map((entry) => ({
    ...entry,
    expectedPage:
      entry.expectedPage.kind === "existing"
        ? { ...entry.expectedPage }
        : { ...entry.expectedPage, create: { ...entry.expectedPage.create } },
    prerequisitePublications: entry.prerequisitePublications.map((publication) => ({ ...publication })),
    publications: entry.publications.map((publication) => ({ ...publication })),
  }));
}

function invalidRuntimeContractCases(): Array<[string, ContentPublicationCutoverInput[]]> {
  const cases: Array<[string, ContentPublicationCutoverInput[]]> = [];
  const mutate = (label: string, mutation: (entries: ContentPublicationCutoverInput[]) => void): void => {
    const entries = cloneCutoverInputs();
    mutation(entries);
    cases.push([label, entries]);
  };

  mutate("an arbitrary slug", (entries) => {
    (entries[0] as { sourceSlug: string }).sourceSlug = "pricing";
  });
  mutate("a missing Privacy entry", (entries) => {
    entries.splice(0, 1);
  });
  mutate("a missing Terms entry", (entries) => {
    entries.splice(1, 1);
  });
  mutate("an absent Privacy Page", (entries) => {
    entries[0]!.expectedPage = BOOTSTRAP_INPUTS[1]!.expectedPage;
  });
  mutate("empty Terms publications", (entries) => {
    entries[1]!.publications = [];
  });
  mutate("partial Terms publications", (entries) => {
    entries[1]!.publications = entries[1]!.publications.slice(0, 1);
  });
  mutate("extra Terms publications", (entries) => {
    entries[1]!.publications.push({
      context: ContentContext.Frontend,
      path: "/terms-extra",
      status: "published",
      templateKey: "frontend-default",
    });
  });
  mutate("a missing Privacy prerequisite", (entries) => {
    entries[0]!.prerequisitePublications = [];
  });
  mutate("a mismatching Privacy prerequisite", (entries) => {
    entries[0]!.prerequisitePublications[0]!.status = "draft";
  });
  mutate("an extra Privacy prerequisite", (entries) => {
    entries[0]!.prerequisitePublications.push({
      context: ContentContext.DeveloperPortal,
      path: "/privacy",
      status: "published",
      templateKey: "developer-default",
    });
  });
  mutate("missing Privacy writes", (entries) => {
    entries[0]!.publications = [];
  });
  mutate("a mismatching Privacy write", (entries) => {
    entries[0]!.publications[0]!.templateKey = "frontend-default";
  });
  mutate("extra Privacy writes", (entries) => {
    entries[0]!.publications.push({
      context: ContentContext.Frontend,
      path: "/privacy",
      status: "published",
      templateKey: "frontend-default",
    });
  });

  return cases;
}

interface SqlPublicationRow {
  page_id: string;
  context: number;
  path: string;
  status: string;
  template_key: string;
}

interface SqlPageRow {
  id: string;
  slug: string;
  title: string;
  content: string;
}

function pageRow(id: string, slug: "privacy" | "terms"): SqlPageRow {
  return {
    id,
    slug,
    title: slug === "privacy" ? "Privacy Policy" : "Terms of Service",
    content: `Canonical ${slug} body`,
  };
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
  pages?: SqlPageRow[];
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
          rows: options.pages ?? [pageRow("page-privacy-stable", "privacy"), pageRow("page-terms-stable", "terms")],
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
      if (sql.includes("INSERT INTO content_pages")) {
        return { rows: [{ id: params?.[0] }] };
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
  it.each(
    invalidRuntimeContractCases(),
  )("rejects %s as an out-of-contract direct call before the first write", async (_case, entries) => {
    const { calls, pool } = createCutoverPool({
      publications: [
        publicationRow("page-privacy-stable", ContentContext.Frontend, "/privacy"),
        publicationRow("page-terms-stable", ContentContext.Frontend, "/terms"),
      ],
    });

    await expect(applyContentPublicationCutover(pool, entries)).rejects.toThrow(/conflict/i);

    expect(calls[0]?.sql).toBe("BEGIN");
    expect(calls.some(({ sql }) => sql.includes("LOCK TABLE content_page_publications"))).toBe(true);
    expect(calls.filter(({ sql }) => sql.includes("INSERT INTO content_pages"))).toHaveLength(0);
    expect(calls.filter(({ sql }) => sql.includes("INSERT INTO content_page_publications"))).toHaveLength(0);
    expect(calls.some(({ sql }) => sql === "ROLLBACK")).toBe(true);
  });

  it("creates the exact missing Terms Page and all publications in the locked transaction", async () => {
    const { calls, pool } = createCutoverPool({
      pages: [pageRow("page-privacy-stable", "privacy")],
      publications: [publicationRow("page-privacy-stable", ContentContext.Frontend, "/privacy")],
    });

    const result = await applyContentPublicationCutover(pool, BOOTSTRAP_INPUTS);

    expect(result.createdPages).toEqual([
      {
        sourceSlug: "terms",
        pageId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        fingerprint: fingerprint("Terms of Service", TERMS_PLACEHOLDER),
      },
    ]);
    expect(result.publications).toEqual([
      {
        pageId: "page-privacy-stable",
        context: ContentContext.DeveloperPortal,
        path: "/privacy",
        status: "published",
        templateKey: "developer-default",
      },
      {
        pageId: result.createdPages[0]!.pageId,
        context: ContentContext.Frontend,
        path: "/terms",
        status: "published",
        templateKey: "frontend-default",
      },
      {
        pageId: result.createdPages[0]!.pageId,
        context: ContentContext.DeveloperPortal,
        path: "/terms",
        status: "published",
        templateKey: "developer-default",
      },
    ]);
    const pageInsert = calls.find(({ sql }) => sql.includes("INSERT INTO content_pages"));
    expect(pageInsert?.params).toEqual([
      result.createdPages[0]!.pageId,
      "terms",
      ContentContext.Frontend | ContentContext.DeveloperPortal,
      "Terms of Service",
      TERMS_PLACEHOLDER,
      "published",
      true,
      "left",
      "default",
      "fullscreen",
      "regular",
      "default",
    ]);
    expect(calls.filter(({ sql }) => sql.includes("INSERT INTO content_pages"))).toHaveLength(1);
    expect(calls.filter(({ sql }) => sql.includes("INSERT INTO content_page_publications"))).toHaveLength(3);
    expect(calls.at(-1)?.sql).toBe("COMMIT");
  });

  it("rejects altered Terms bootstrap content even when its supplied fingerprint matches", async () => {
    const alteredBody = "Unreviewed replacement legal text";
    const alteredInputs: ContentPublicationCutoverInput[] = [
      BOOTSTRAP_INPUTS[0]!,
      {
        ...BOOTSTRAP_INPUTS[1]!,
        expectedPage: {
          kind: "absent",
          fingerprint: fingerprint("Terms of Service", alteredBody),
          create: {
            title: "Terms of Service",
            content: alteredBody,
            contextMask: ContentContext.Frontend | ContentContext.DeveloperPortal,
            status: "published",
            showTitle: true,
            titleAlignment: "left",
            pageType: "default",
            displayMode: "fullscreen",
            overlayWidth: "regular",
            contentCardStyle: "default",
          },
        },
      },
    ];
    const { calls, pool } = createCutoverPool({
      pages: [pageRow("page-privacy-stable", "privacy")],
      publications: [publicationRow("page-privacy-stable", ContentContext.Frontend, "/privacy")],
    });

    await expect(applyContentPublicationCutover(pool, alteredInputs)).rejects.toThrow(/conflict/i);

    expect(calls.filter(({ sql }) => sql.includes("INSERT INTO content_pages"))).toHaveLength(0);
    expect(calls.filter(({ sql }) => sql.includes("INSERT INTO content_page_publications"))).toHaveLength(0);
    expect(calls.some(({ sql }) => /\bDELETE\b|\bUPDATE content_page_publications\b/.test(sql))).toBe(false);
    expect(calls.some(({ sql }) => sql === "ROLLBACK")).toBe(true);
  });

  it("aborts before writes when an existing canonical body fingerprint drifts under lock", async () => {
    const driftedPrivacy = pageRow("page-privacy-stable", "privacy");
    driftedPrivacy.content = "Changed after dry-run";
    const { calls, pool } = createCutoverPool({
      pages: [driftedPrivacy, pageRow("page-terms-stable", "terms")],
      publications: [
        publicationRow("page-privacy-stable", ContentContext.Frontend, "/privacy"),
        publicationRow("page-terms-stable", ContentContext.Frontend, "/terms"),
      ],
    });

    await expect(applyContentPublicationCutover(pool, CUTOVER_INPUTS)).rejects.toThrow(/conflict/i);

    expect(calls.filter(({ sql }) => sql.includes("INSERT INTO content_pages"))).toHaveLength(0);
    expect(calls.filter(({ sql }) => sql.includes("INSERT INTO content_page_publications"))).toHaveLength(0);
    expect(calls.some(({ sql }) => sql === "ROLLBACK")).toBe(true);
  });

  it.each([
    ["missing", []],
    [
      "mismatching",
      [
        {
          ...publicationRow("page-privacy-stable", ContentContext.Frontend, "/privacy"),
          status: "draft",
        },
      ],
    ],
    [
      "duplicate",
      [
        publicationRow("page-privacy-stable", ContentContext.Frontend, "/privacy"),
        publicationRow("page-privacy-stable", ContentContext.Frontend, "/privacy"),
      ],
    ],
  ])("rolls back a %s locked Privacy Frontend prerequisite before writes", async (_case, privacyRows) => {
    const { calls, pool } = createCutoverPool({
      publications: [...privacyRows, publicationRow("page-terms-stable", ContentContext.Frontend, "/terms")],
    });

    await expect(applyContentPublicationCutover(pool, CUTOVER_INPUTS)).rejects.toThrow(/conflict/i);

    expect(calls.filter(({ sql }) => sql.includes("INSERT INTO content_pages"))).toHaveLength(0);
    expect(calls.filter(({ sql }) => sql.includes("INSERT INTO content_page_publications"))).toHaveLength(0);
    expect(calls.some(({ sql }) => /\bDELETE\b|\bUPDATE content_page_publications\b/.test(sql))).toBe(false);
    expect(calls.some(({ sql }) => sql === "ROLLBACK")).toBe(true);
  });

  it("aborts rather than adopting a concurrently created Terms identity", async () => {
    const { calls, pool } = createCutoverPool({
      pages: [pageRow("page-privacy-stable", "privacy"), pageRow("concurrent-terms", "terms")],
      publications: [publicationRow("page-privacy-stable", ContentContext.Frontend, "/privacy")],
    });

    await expect(applyContentPublicationCutover(pool, BOOTSTRAP_INPUTS)).rejects.toThrow(/conflict/i);

    expect(calls.filter(({ sql }) => sql.includes("INSERT INTO content_pages"))).toHaveLength(0);
    expect(calls.filter(({ sql }) => sql.includes("INSERT INTO content_page_publications"))).toHaveLength(0);
    expect(calls.some(({ sql }) => sql === "ROLLBACK")).toBe(true);
  });

  it.each([
    ContentContext.Frontend,
    ContentContext.DeveloperPortal,
  ])("aborts before Page creation when context %s already claims /terms", async (context) => {
    const { calls, pool } = createCutoverPool({
      pages: [pageRow("page-privacy-stable", "privacy")],
      publications: [
        publicationRow("page-privacy-stable", ContentContext.Frontend, "/privacy"),
        publicationRow("other-terms-owner", context, "/terms"),
      ],
    });

    await expect(applyContentPublicationCutover(pool, BOOTSTRAP_INPUTS)).rejects.toThrow(/conflict/i);

    expect(calls.filter(({ sql }) => sql.includes("INSERT INTO content_pages"))).toHaveLength(0);
    expect(calls.filter(({ sql }) => sql.includes("INSERT INTO content_page_publications"))).toHaveLength(0);
    expect(calls.some(({ sql }) => sql === "ROLLBACK")).toBe(true);
  });

  it("rolls back the created Terms Page and every publication when a later insert fails", async () => {
    const { calls, pool } = createCutoverPool({
      pages: [pageRow("page-privacy-stable", "privacy")],
      publications: [publicationRow("page-privacy-stable", ContentContext.Frontend, "/privacy")],
      failInsertAt: 2,
    });

    await expect(applyContentPublicationCutover(pool, BOOTSTRAP_INPUTS)).rejects.toThrow(
      "simulated second insert failure",
    );

    expect(calls.filter(({ sql }) => sql.includes("INSERT INTO content_pages"))).toHaveLength(1);
    expect(calls.filter(({ sql }) => sql.includes("INSERT INTO content_page_publications"))).toHaveLength(2);
    expect(calls.some(({ sql }) => sql === "ROLLBACK")).toBe(true);
    expect(calls.some(({ sql }) => sql === "COMMIT")).toBe(false);
  });

  it("preserves an existing Terms body and inserts only its missing exact publication", async () => {
    const existingTermsBody = "Operator-authored binding Terms";
    const existingTerms = pageRow("page-terms-stable", "terms");
    existingTerms.content = existingTermsBody;
    const inputs: ContentPublicationCutoverInput[] = [
      CUTOVER_INPUTS[0]!,
      {
        ...CUTOVER_INPUTS[1]!,
        expectedPage: {
          kind: "existing",
          pageId: "page-terms-stable",
          fingerprint: fingerprint("Terms of Service", existingTermsBody),
        },
      },
    ];
    const { calls, pool } = createCutoverPool({
      pages: [pageRow("page-privacy-stable", "privacy"), existingTerms],
      publications: [
        publicationRow("page-privacy-stable", ContentContext.Frontend, "/privacy"),
        publicationRow("page-terms-stable", ContentContext.DeveloperPortal, "/terms"),
      ],
    });

    const result = await applyContentPublicationCutover(pool, inputs);

    expect(result.createdPages).toEqual([]);
    expect(result.publications).toContainEqual({
      pageId: "page-terms-stable",
      context: ContentContext.Frontend,
      path: "/terms",
      status: "published",
      templateKey: "frontend-default",
    });
    expect(calls.filter(({ sql }) => sql.includes("INSERT INTO content_pages"))).toHaveLength(0);
    expect(calls.some(({ sql }) => /SET\s+content\s*=/.test(sql))).toBe(false);
    expect(calls.some(({ params }) => params?.includes(TERMS_PLACEHOLDER))).toBe(false);
  });

  it("locks and revalidates once, then inserts missing publications without deleting unrelated rows", async () => {
    const { calls, pool } = createCutoverPool({
      publications: [
        publicationRow("page-privacy-stable", ContentContext.Frontend, "/privacy"),
        publicationRow("page-terms-stable", ContentContext.Frontend, "/terms"),
        publicationRow("unrelated-page", ContentContext.Frontend, "/pricing"),
      ],
    });

    await expect(applyContentPublicationCutover(pool, CUTOVER_INPUTS)).resolves.toEqual({
      createdPages: [],
      publications: [
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
      ],
    });

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
        { ...pageRow("page-privacy-stable", "privacy"), slug: "privacy-renamed" },
        pageRow("page-terms-stable", "terms"),
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

    await expect(applyContentPublicationCutover(pool, CUTOVER_INPUTS)).resolves.toEqual({
      createdPages: [],
      publications: [],
    });
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
