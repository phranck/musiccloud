import { createHash, randomUUID } from "node:crypto";

import { ContentContext, PageType, type ContentPublication } from "@musiccloud/shared";
import { describe, expect, it, vi } from "vitest";

import type {
  AdminRepository,
  ContentPageRow,
  ContentPageSummaryRow,
  ContentPublicationCutoverInput,
  ContentPublicationCutoverResult,
  ContentPublicationRow,
} from "../db/admin-repository.js";
import {
  DEVELOPER_EDITORIAL_CUTOVER_MAPPING,
  backfillDeveloperEditorialContent,
  formatDeveloperEditorialCutoverReport,
  isDirectCommonJsCutoverEntrypoint,
  isDirectTsxCutoverEntrypoint,
} from "./backfill-developer-editorial-content.js";

const FIXED_DATE = new Date("2026-07-18T08:00:00.000Z");
const TERMS_PLACEHOLDER =
  "The full Terms of Service for the musiccloud developer portal and API are being finalised and will be published here before public API access opens. Until then, this page is a placeholder.";

function publication(
  pageId: string,
  context: ContentPublication["context"],
  path: string,
  overrides: Partial<ContentPublication> = {},
): ContentPublicationRow {
  return {
    pageId,
    context,
    path,
    status: "published",
    templateKey: context === ContentContext.Frontend ? "frontend-default" : "developer-default",
    ...overrides,
  };
}

function page(overrides: Partial<ContentPageRow> = {}): ContentPageRow {
  const id = overrides.id ?? "page-privacy-stable";
  const slug = overrides.slug ?? "privacy";
  return {
    id,
    slug,
    contextMask: ContentContext.Frontend,
    publications: [publication(id, ContentContext.Frontend, `/${slug}`)],
    title: slug === "privacy" ? "Privacy Policy" : "Terms of Service",
    content: `Canonical ${slug} body`,
    status: "published",
    showTitle: true,
    titleAlignment: "left",
    pageType: PageType.Default,
    displayMode: "fullscreen",
    overlayWidth: "regular",
    contentCardStyle: "recessed",
    createdBy: null,
    updatedBy: null,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
    contentUpdatedAt: FIXED_DATE,
    ...overrides,
  };
}

function canonicalPages(): ContentPageRow[] {
  return [
    page(),
    page({
      id: "page-terms-stable",
      slug: "terms",
      title: "Terms of Service",
      content: "Canonical terms body",
      publications: [publication("page-terms-stable", ContentContext.Frontend, "/terms")],
    }),
  ];
}

function fingerprint(title: string, content: string): string {
  return createHash("sha256").update(JSON.stringify({ title, content })).digest("hex");
}

class InMemoryEditorialRepository {
  readonly sourceReads: string[] = [];
  readonly atomicApplies: ContentPublicationCutoverInput[][] = [];
  readonly writes: ContentPublicationRow[] = [];
  readonly createContentPage = vi.fn();
  readonly replaceContentPublications = vi.fn(async () => {
    throw new Error("Destructive publication replacement is forbidden during cutover");
  });
  readonly updateContentPageBody = vi.fn();
  readonly updateContentPageMeta = vi.fn();
  readonly replaceSegmentsForOwner = vi.fn();
  readonly replaceSegmentTranslations = vi.fn();
  readonly upsertPageTranslation = vi.fn();

  constructor(readonly pages: ContentPageRow[]) {}

  async listContentPageSummaries(): Promise<ContentPageSummaryRow[]> {
    return this.pages.map(({ content: _content, contentUpdatedAt: _contentUpdatedAt, ...summary }) => ({
      ...summary,
      publications: summary.publications?.map((entry) => ({ ...entry })),
    }));
  }

  async getContentPageById(id: string): Promise<ContentPageRow | null> {
    this.sourceReads.push(id);
    const found = this.pages.find((entry) => entry.id === id);
    return found
      ? {
          ...found,
          publications: found.publications?.map((entry) => ({ ...entry })),
        }
      : null;
  }

  async applyContentPublicationCutover(
    entries: ContentPublicationCutoverInput[],
  ): Promise<ContentPublicationCutoverResult> {
    this.atomicApplies.push(
      entries.map((entry) => ({
        ...entry,
        expectedPage:
          entry.expectedPage.kind === "existing"
            ? { ...entry.expectedPage }
            : { ...entry.expectedPage, create: { ...entry.expectedPage.create } },
        publications: entry.publications.map((publication) => ({ ...publication })),
      })),
    );
    const staged: ContentPageRow[] = this.pages.map((entry) => ({
      ...entry,
      publications: (entry.publications ?? []).map((publication) => ({ ...publication })),
    }));
    const createdPages: ContentPublicationCutoverResult["createdPages"] = [];
    const inserted: ContentPublicationRow[] = [];
    for (const entry of entries) {
      let target: ContentPageRow | undefined;
      if (entry.expectedPage.kind === "existing") {
        const expectedPage = entry.expectedPage;
        target = staged.find((candidate) => candidate.id === expectedPage.pageId);
        if (
          !target ||
          target.slug !== entry.sourceSlug ||
          fingerprint(target.title, target.content) !== expectedPage.fingerprint
        ) {
          throw new Error("Cutover identity conflict");
        }
      } else {
        if (staged.some((candidate) => candidate.slug === entry.sourceSlug)) {
          throw new Error("Cutover absence conflict");
        }
        const pageId = randomUUID();
        target = {
          id: pageId,
          slug: entry.sourceSlug,
          ...entry.expectedPage.create,
          publications: [],
          createdBy: null,
          updatedBy: null,
          createdAt: FIXED_DATE,
          updatedAt: null,
          contentUpdatedAt: FIXED_DATE,
        };
        staged.push(target);
        createdPages.push({
          sourceSlug: entry.sourceSlug,
          pageId,
          fingerprint: entry.expectedPage.fingerprint,
        });
      }

      for (const desired of entry.publications) {
        const current = target.publications?.find((publication) => publication.context === desired.context);
        if (current) {
          if (
            current.path !== desired.path ||
            current.status !== desired.status ||
            current.templateKey !== desired.templateKey
          ) {
            throw new Error("Cutover publication conflict");
          }
          continue;
        }
        const row = { pageId: target.id!, ...desired };
        target.publications ??= [];
        target.publications.push(row);
        target.contextMask = (target.contextMask ?? 0) | desired.context;
        inserted.push(row);
      }
    }
    this.pages.splice(0, this.pages.length, ...staged);
    this.writes.push(...inserted);
    return { createdPages, publications: inserted };
  }
}

function repository(pages: ContentPageRow[]): { fake: InMemoryEditorialRepository; repo: AdminRepository } {
  const fake = new InMemoryEditorialRepository(pages);
  return { fake, repo: fake as unknown as AdminRepository };
}

describe("DEVELOPER_EDITORIAL_CUTOVER_MAPPING", () => {
  it("contains exactly the two canonical Developer Portal publications and excludes every system or artifact source", () => {
    expect(DEVELOPER_EDITORIAL_CUTOVER_MAPPING).toEqual([
      {
        sourceSlug: "privacy",
        context: ContentContext.DeveloperPortal,
        path: "/privacy",
        status: "published",
        templateKey: "developer-default",
      },
      {
        sourceSlug: "terms",
        context: ContentContext.DeveloperPortal,
        path: "/terms",
        status: "published",
        templateKey: "developer-default",
      },
    ]);
    expect(Object.isFrozen(DEVELOPER_EDITORIAL_CUTOVER_MAPPING)).toBe(true);
    expect(DEVELOPER_EDITORIAL_CUTOVER_MAPPING.every(Object.isFrozen)).toBe(true);

    const excludedSources = [
      "/docs",
      "/docs/api",
      "/docs/guides/getting-started",
      "/docs/reference/auth/tokens",
      "/pricing",
      "/",
      "landing",
      "openapi.json",
      "sdk/typescript",
      "README.md",
      "generated/openapi.json",
    ];
    for (const source of excludedSources) {
      expect(
        DEVELOPER_EDITORIAL_CUTOVER_MAPPING.some(
          (entry) => entry.path === source || entry.sourceSlug === source.replace(/^\//, ""),
        ),
      ).toBe(false);
    }
  });
});

describe("backfillDeveloperEditorialContent", () => {
  it("plans one canonical Terms Page and both Terms publications when Terms is absent", async () => {
    const { fake, repo } = repository([page()]);

    const result = await backfillDeveloperEditorialContent(repo, { dryRun: true });

    expect(result.counts).toEqual({
      pages: 1,
      publications: 1,
      mappings: 3,
      plannedPageCreates: 1,
      plannedPublicationWrites: 3,
      plannedWrites: 4,
      conflicts: 0,
      pageCreates: 0,
      publicationWrites: 0,
      writes: 0,
    });
    expect(result.pagePlans).toEqual([
      {
        sourceSlug: "privacy",
        pageId: "page-privacy-stable",
        fingerprint: fingerprint("Privacy Policy", "Canonical privacy body"),
        outcome: "existing",
      },
      {
        sourceSlug: "terms",
        pageId: null,
        fingerprint: fingerprint("Terms of Service", TERMS_PLACEHOLDER),
        outcome: "create",
      },
    ]);
    expect(result.mappings).toEqual([
      expect.objectContaining({
        sourceSlug: "privacy",
        pageId: "page-privacy-stable",
        context: ContentContext.DeveloperPortal,
        outcome: "add",
      }),
      expect.objectContaining({
        sourceSlug: "terms",
        pageId: null,
        context: ContentContext.Frontend,
        outcome: "add",
      }),
      expect.objectContaining({
        sourceSlug: "terms",
        pageId: null,
        context: ContentContext.DeveloperPortal,
        outcome: "add",
      }),
    ]);
    expect(result.conflicts).toEqual([]);
    expect(result.createdPages).toEqual([]);
    expect(result.writes).toEqual([]);
    expect(fake.sourceReads).toEqual(["page-privacy-stable"]);
    expect(fake.atomicApplies).toEqual([]);

    const output = formatDeveloperEditorialCutoverReport(result);
    expect(output).not.toContain(TERMS_PLACEHOLDER);
  });

  it("atomically creates the exact canonical Terms Page and publishes it in both contexts", async () => {
    const pages = [page()];
    const { fake, repo } = repository(pages);

    const result = await backfillDeveloperEditorialContent(repo, { dryRun: false });

    expect(result.counts).toMatchObject({
      plannedPageCreates: 1,
      plannedPublicationWrites: 3,
      pageCreates: 1,
      publicationWrites: 3,
      writes: 4,
    });
    expect(result.createdPages).toEqual([
      {
        sourceSlug: "terms",
        pageId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        fingerprint: fingerprint("Terms of Service", TERMS_PLACEHOLDER),
      },
    ]);
    expect(pages).toHaveLength(2);
    expect(pages[1]).toMatchObject({
      id: result.createdPages[0]!.pageId,
      slug: "terms",
      contextMask: ContentContext.Frontend | ContentContext.DeveloperPortal,
      title: "Terms of Service",
      content: TERMS_PLACEHOLDER,
      status: "published",
      showTitle: true,
      titleAlignment: "left",
      pageType: PageType.Default,
      displayMode: "fullscreen",
      overlayWidth: "regular",
      contentCardStyle: "default",
      createdBy: null,
      updatedBy: null,
      publications: [
        publication(result.createdPages[0]!.pageId, ContentContext.Frontend, "/terms"),
        publication(result.createdPages[0]!.pageId, ContentContext.DeveloperPortal, "/terms"),
      ],
    });
    expect(result.writes).toEqual([
      { pageId: "page-privacy-stable", context: ContentContext.DeveloperPortal, path: "/privacy" },
      { pageId: result.createdPages[0]!.pageId, context: ContentContext.Frontend, path: "/terms" },
      { pageId: result.createdPages[0]!.pageId, context: ContentContext.DeveloperPortal, path: "/terms" },
    ]);
    expect(fake.replaceContentPublications).not.toHaveBeenCalled();
    expect(fake.createContentPage).not.toHaveBeenCalled();
    expect(fake.updateContentPageBody).not.toHaveBeenCalled();
    expect(fake.updateContentPageMeta).not.toHaveBeenCalled();

    const second = await backfillDeveloperEditorialContent(repo, { dryRun: false });
    expect(second.counts).toMatchObject({
      plannedPageCreates: 0,
      plannedPublicationWrites: 0,
      pageCreates: 0,
      publicationWrites: 0,
      writes: 0,
    });
    expect(second.createdPages).toEqual([]);
    expect(second.writes).toEqual([]);
    expect(pages).toHaveLength(2);
  });

  it("reports deterministic dry-run fingerprints and current-versus-desired publications without writes", async () => {
    const pages = canonicalPages();
    const { fake, repo } = repository(pages);

    const result = await backfillDeveloperEditorialContent(repo, { dryRun: true });

    expect(result.counts).toEqual({
      pages: 2,
      publications: 2,
      mappings: 3,
      plannedPageCreates: 0,
      plannedPublicationWrites: 2,
      plannedWrites: 2,
      conflicts: 0,
      pageCreates: 0,
      publicationWrites: 0,
      writes: 0,
    });
    expect(result.mappings).toEqual([
      {
        sourceSlug: "privacy",
        pageId: "page-privacy-stable",
        fingerprint: fingerprint("Privacy Policy", "Canonical privacy body"),
        context: ContentContext.DeveloperPortal,
        currentPublication: null,
        desiredPublication: {
          context: ContentContext.DeveloperPortal,
          path: "/privacy",
          status: "published",
          templateKey: "developer-default",
        },
        outcome: "add",
      },
      {
        sourceSlug: "terms",
        pageId: "page-terms-stable",
        fingerprint: fingerprint("Terms of Service", "Canonical terms body"),
        context: ContentContext.Frontend,
        currentPublication: {
          context: ContentContext.Frontend,
          path: "/terms",
          status: "published",
          templateKey: "frontend-default",
        },
        desiredPublication: {
          context: ContentContext.Frontend,
          path: "/terms",
          status: "published",
          templateKey: "frontend-default",
        },
        outcome: "unchanged",
      },
      {
        sourceSlug: "terms",
        pageId: "page-terms-stable",
        fingerprint: fingerprint("Terms of Service", "Canonical terms body"),
        context: ContentContext.DeveloperPortal,
        currentPublication: null,
        desiredPublication: {
          context: ContentContext.DeveloperPortal,
          path: "/terms",
          status: "published",
          templateKey: "developer-default",
        },
        outcome: "add",
      },
    ]);
    expect(result.conflicts).toEqual([]);
    expect(result.createdPages).toEqual([]);
    expect(result.writes).toEqual([]);
    expect(fake.sourceReads).toEqual(["page-privacy-stable", "page-terms-stable"]);
    expect(fake.writes).toEqual([]);

    const output = formatDeveloperEditorialCutoverReport(result);
    expect(output).not.toContain("Canonical privacy body");
    expect(output).not.toContain("Canonical terms body");
    expect(output).not.toMatch(/DATABASE_URL|password|credential/i);
  });

  it("applies only missing publications and a second apply performs zero writes", async () => {
    const pages = canonicalPages();
    const originalContent = pages.map(({ id, title, content }) => ({ id, title, content }));
    const { fake, repo } = repository(pages);

    const first = await backfillDeveloperEditorialContent(repo, { dryRun: false });
    const second = await backfillDeveloperEditorialContent(repo, { dryRun: false });

    expect(first.counts).toMatchObject({ plannedWrites: 2, conflicts: 0, writes: 2 });
    expect(first.writes).toEqual([
      { pageId: "page-privacy-stable", context: ContentContext.DeveloperPortal, path: "/privacy" },
      { pageId: "page-terms-stable", context: ContentContext.DeveloperPortal, path: "/terms" },
    ]);
    expect(second.counts).toMatchObject({ plannedWrites: 0, conflicts: 0, writes: 0 });
    expect(second.mappings.map((entry) => entry.outcome)).toEqual(["unchanged", "unchanged", "unchanged"]);
    expect(fake.atomicApplies).toHaveLength(2);
    expect(fake.atomicApplies[0]).toEqual([
      {
        sourceSlug: "privacy",
        expectedPage: {
          kind: "existing",
          pageId: "page-privacy-stable",
          fingerprint: fingerprint("Privacy Policy", "Canonical privacy body"),
        },
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
    ]);
    expect(fake.writes.map((entry) => entry.pageId)).toEqual(["page-privacy-stable", "page-terms-stable"]);
    expect(fake.replaceContentPublications).not.toHaveBeenCalled();
    expect(pages.map(({ id, title, content }) => ({ id, title, content }))).toEqual(originalContent);
    for (const storedPage of pages) {
      expect(storedPage.publications).toHaveLength(2);
      expect(storedPage.publications).toContainEqual(
        publication(storedPage.id!, ContentContext.Frontend, `/${storedPage.slug}`),
      );
      expect(storedPage.publications).toContainEqual(
        publication(storedPage.id!, ContentContext.DeveloperPortal, `/${storedPage.slug}`),
      );
    }
  });

  it("reads canonical title and content but never invokes content, identity, translation, or segment writes", async () => {
    const pages = [
      ...canonicalPages(),
      page({
        id: "page-pricing-stable",
        slug: "pricing",
        title: "Pricing",
        content: "Unrelated pricing body",
        publications: [publication("page-pricing-stable", ContentContext.Frontend, "/pricing")],
      }),
    ];
    const { fake, repo } = repository(pages);

    await backfillDeveloperEditorialContent(repo, { dryRun: false });

    expect(fake.sourceReads).toEqual(["page-privacy-stable", "page-terms-stable"]);
    expect(fake.writes.map((entry) => entry.pageId)).toEqual(["page-privacy-stable", "page-terms-stable"]);
    expect(fake.replaceContentPublications).not.toHaveBeenCalled();
    expect(fake.createContentPage).not.toHaveBeenCalled();
    expect(fake.updateContentPageBody).not.toHaveBeenCalled();
    expect(fake.updateContentPageMeta).not.toHaveBeenCalled();
    expect(fake.replaceSegmentsForOwner).not.toHaveBeenCalled();
    expect(fake.replaceSegmentTranslations).not.toHaveBeenCalled();
    expect(fake.upsertPageTranslation).not.toHaveBeenCalled();
    expect(pages[2]).toMatchObject({
      id: "page-pricing-stable",
      title: "Pricing",
      content: "Unrelated pricing body",
      publications: [publication("page-pricing-stable", ContentContext.Frontend, "/pricing")],
    });
  });

  it("reports an ambiguous Privacy identity while still planning the absent Terms bootstrap", async () => {
    const pages = [
      page({ id: "privacy-a" }),
      page({ id: "privacy-b", publications: [publication("privacy-b", ContentContext.Frontend, "/other")] }),
    ];
    const { fake, repo } = repository(pages);

    const dryRun = await backfillDeveloperEditorialContent(repo, { dryRun: true });

    expect(dryRun.conflicts.map((entry) => entry.code)).toEqual(["ambiguous-source"]);
    expect(dryRun.counts).toMatchObject({
      plannedPageCreates: 1,
      plannedPublicationWrites: 2,
      plannedWrites: 3,
      conflicts: 1,
      writes: 0,
    });
    await expect(backfillDeveloperEditorialContent(repo, { dryRun: false })).rejects.toThrow(
      "Developer editorial cutover conflicts detected",
    );
    expect(fake.writes).toEqual([]);
  });

  it("treats a missing Privacy identity as a conflict and performs no writes", async () => {
    const terms = canonicalPages()[1]!;
    const { fake, repo } = repository([terms]);

    const dryRun = await backfillDeveloperEditorialContent(repo, { dryRun: true });

    expect(dryRun.conflicts.map((entry) => entry.code)).toEqual(["missing-source"]);
    expect(dryRun.pagePlans).toContainEqual({
      sourceSlug: "privacy",
      pageId: null,
      fingerprint: null,
      outcome: "conflict",
    });
    await expect(backfillDeveloperEditorialContent(repo, { dryRun: false })).rejects.toThrow(
      "Developer editorial cutover conflicts detected",
    );
    expect(fake.atomicApplies).toEqual([]);
    expect(fake.writes).toEqual([]);
  });

  it("treats a publication owner mismatch as a direct conflict with no repository apply", async () => {
    const pages = canonicalPages();
    pages[1]!.publications![0]!.pageId = "different-owner";
    const { fake, repo } = repository(pages);

    const dryRun = await backfillDeveloperEditorialContent(repo, { dryRun: true });

    expect(dryRun.conflicts.map((entry) => entry.code)).toContain("publication-owner-mismatch");
    await expect(backfillDeveloperEditorialContent(repo, { dryRun: false })).rejects.toThrow(
      "Developer editorial cutover conflicts detected",
    );
    expect(fake.atomicApplies).toEqual([]);
    expect(fake.writes).toEqual([]);
  });

  it("treats an invalid publication path as a direct conflict with no repository apply", async () => {
    const pages = canonicalPages();
    pages.push(
      page({
        id: "invalid-path-owner",
        slug: "invalid-path-owner",
        publications: [
          publication("invalid-path-owner", ContentContext.Frontend, "/invalid%2fseparator"),
        ],
      }),
    );
    const { fake, repo } = repository(pages);

    const dryRun = await backfillDeveloperEditorialContent(repo, { dryRun: true });

    expect(dryRun.conflicts.map((entry) => entry.code)).toContain("invalid-publication-path");
    await expect(backfillDeveloperEditorialContent(repo, { dryRun: false })).rejects.toThrow(
      "Developer editorial cutover conflicts detected",
    );
    expect(fake.atomicApplies).toEqual([]);
    expect(fake.writes).toEqual([]);
  });

  it("treats a source identity mismatch as a direct conflict with no repository apply", async () => {
    const pages = canonicalPages();
    const { fake, repo } = repository(pages);
    vi.spyOn(fake, "getContentPageById").mockImplementation(async (id) => {
      const source = pages.find((entry) => entry.id === id);
      return source ? { ...source, slug: id === "page-privacy-stable" ? "privacy-renamed" : source.slug } : null;
    });

    const dryRun = await backfillDeveloperEditorialContent(repo, { dryRun: true });

    expect(dryRun.conflicts.map((entry) => entry.code)).toContain("source-identity-mismatch");
    await expect(backfillDeveloperEditorialContent(repo, { dryRun: false })).rejects.toThrow(
      "Developer editorial cutover conflicts detected",
    );
    expect(fake.atomicApplies).toEqual([]);
    expect(fake.writes).toEqual([]);
  });

  it("detects mismatching target metadata, conflicting route claims, and canonical duplicate claims before writes", async () => {
    const pages = canonicalPages();
    pages[0]!.publications!.push(
      publication("page-privacy-stable", ContentContext.DeveloperPortal, "//privacy/"),
    );
    pages.push(
      page({
        id: "route-owner",
        slug: "elsewhere",
        publications: [publication("route-owner", ContentContext.DeveloperPortal, "//terms/")],
      }),
      page({
        id: "duplicate-owner",
        slug: "duplicate",
        publications: [publication("duplicate-owner", ContentContext.Frontend, "//privacy/")],
      }),
    );
    const { fake, repo } = repository(pages);

    const result = await backfillDeveloperEditorialContent(repo, { dryRun: true });

    expect(result.conflicts.map((entry) => entry.code)).toEqual([
      "canonical-duplicate-claim",
      "target-publication-mismatch",
      "target-route-claimed",
    ]);
    await expect(backfillDeveloperEditorialContent(repo, { dryRun: false })).rejects.toThrow(
      "Developer editorial cutover conflicts detected",
    );
    expect(fake.writes).toEqual([]);
  });

  it("rejects every reserved docs claim without reading docs, API, SDK, or generated artifact bodies", async () => {
    const pages = [
      ...canonicalPages(),
      page({
        id: "page-docs-root",
        slug: "docs",
        content: "Docs root source",
        publications: [publication("page-docs-root", ContentContext.DeveloperPortal, "/docs")],
      }),
      page({
        id: "page-docs-guide",
        slug: "docs-guide",
        content: "Docs guide source",
        publications: [publication("page-docs-guide", ContentContext.DeveloperPortal, "/docs/guides/install")],
      }),
      page({
        id: "page-docs-api",
        slug: "docs-api",
        content: "API artifact source",
        publications: [publication("page-docs-api", ContentContext.DeveloperPortal, "//docs/api/reference/")],
      }),
      page({
        id: "page-sdk-artifact",
        slug: "sdk-artifact",
        content: "Generated SDK artifact source",
        publications: [publication("page-sdk-artifact", ContentContext.Frontend, "/sdk/typescript")],
      }),
    ];
    const { fake, repo } = repository(pages);

    const result = await backfillDeveloperEditorialContent(repo, { dryRun: true });

    expect(result.conflicts.filter((entry) => entry.code === "reserved-developer-path")).toHaveLength(3);
    expect(result.counts).toMatchObject({ plannedWrites: 2, conflicts: 3, writes: 0 });
    expect(fake.sourceReads).toEqual(["page-privacy-stable", "page-terms-stable"]);
    expect(fake.sourceReads).not.toContain("page-docs-root");
    expect(fake.sourceReads).not.toContain("page-docs-guide");
    expect(fake.sourceReads).not.toContain("page-docs-api");
    expect(fake.sourceReads).not.toContain("page-sdk-artifact");
    await expect(backfillDeveloperEditorialContent(repo, { dryRun: false })).rejects.toThrow(
      "Developer editorial cutover conflicts detected",
    );
    expect(fake.writes).toEqual([]);
  });
});

describe("developer editorial cutover CLI entrypoint", () => {
  it("uses module identity for compiled CommonJS direct execution", () => {
    const entrypoint = {} as NodeModule;

    expect(isDirectCommonJsCutoverEntrypoint(entrypoint, entrypoint)).toBe(true);
    expect(isDirectCommonJsCutoverEntrypoint(entrypoint, {} as NodeModule)).toBe(false);
    expect(isDirectCommonJsCutoverEntrypoint(undefined, entrypoint)).toBe(false);
    expect(isDirectCommonJsCutoverEntrypoint(undefined, undefined)).toBe(false);
  });

  it("recognizes only the exact TypeScript source path used by tsx", () => {
    expect(
      isDirectTsxCutoverEntrypoint("/workspace/apps/backend/src/scripts/backfill-developer-editorial-content.ts"),
    ).toBe(true);
    expect(
      isDirectTsxCutoverEntrypoint(
        "C:\\workspace\\apps\\backend\\src\\scripts\\backfill-developer-editorial-content.ts",
      ),
    ).toBe(true);
    expect(
      isDirectTsxCutoverEntrypoint(
        "/workspace/apps/backend/src/scripts/backfill-developer-editorial-content.js",
      ),
    ).toBe(false);
    expect(isDirectTsxCutoverEntrypoint("/workspace/apps/backend/src/scripts/import-cutover.ts")).toBe(false);
    expect(isDirectTsxCutoverEntrypoint(undefined)).toBe(false);
  });
});
