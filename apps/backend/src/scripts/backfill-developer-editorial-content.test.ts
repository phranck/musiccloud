import { createHash } from "node:crypto";

import { ContentContext, PageType, type ContentPublication } from "@musiccloud/shared";
import { describe, expect, it, vi } from "vitest";

import type {
  AdminRepository,
  ContentPageRow,
  ContentPageSummaryRow,
  ContentPublicationRow,
} from "../db/admin-repository.js";
import {
  DEVELOPER_EDITORIAL_CUTOVER_MAPPING,
  backfillDeveloperEditorialContent,
  formatDeveloperEditorialCutoverReport,
} from "./backfill-developer-editorial-content.js";

const FIXED_DATE = new Date("2026-07-18T08:00:00.000Z");

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
  readonly writes: Array<{ pageId: string; publications: ContentPublication[] }> = [];
  readonly createContentPage = vi.fn();
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

  async replaceContentPublications(
    pageId: string,
    publications: ContentPublication[],
  ): Promise<ContentPublicationRow[]> {
    this.writes.push({ pageId, publications: publications.map((entry) => ({ ...entry })) });
    const found = this.pages.find((entry) => entry.id === pageId);
    if (!found) throw new Error(`Unknown test page: ${pageId}`);
    found.publications = publications.map((entry) => ({ pageId, ...entry }));
    found.contextMask = publications.reduce((mask, entry) => mask | entry.context, 0);
    return found.publications;
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
  it("reports deterministic dry-run fingerprints and current-versus-desired publications without writes", async () => {
    const pages = canonicalPages();
    const { fake, repo } = repository(pages);

    const result = await backfillDeveloperEditorialContent(repo, { dryRun: true });

    expect(result.counts).toEqual({
      pages: 2,
      publications: 2,
      mappings: 2,
      plannedWrites: 2,
      conflicts: 0,
      writes: 0,
    });
    expect(result.mappings).toEqual([
      {
        sourceSlug: "privacy",
        pageId: "page-privacy-stable",
        fingerprint: fingerprint("Privacy Policy", "Canonical privacy body"),
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
    expect(second.mappings.map((entry) => entry.outcome)).toEqual(["unchanged", "unchanged"]);
    expect(fake.writes.map((entry) => entry.pageId)).toEqual(["page-privacy-stable", "page-terms-stable"]);
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

  it("reports missing and ambiguous canonical source identities and aborts before writes", async () => {
    const pages = [
      page({ id: "privacy-a" }),
      page({ id: "privacy-b", publications: [publication("privacy-b", ContentContext.Frontend, "/other")] }),
    ];
    const { fake, repo } = repository(pages);

    const dryRun = await backfillDeveloperEditorialContent(repo, { dryRun: true });

    expect(dryRun.conflicts.map((entry) => entry.code)).toEqual(["ambiguous-source", "missing-source"]);
    expect(dryRun.counts).toMatchObject({ plannedWrites: 0, conflicts: 2, writes: 0 });
    await expect(backfillDeveloperEditorialContent(repo, { dryRun: false })).rejects.toThrow(
      "Developer editorial cutover conflicts detected",
    );
    expect(fake.writes).toEqual([]);
  });

  it("detects mismatching target metadata, conflicting route claims, and canonical duplicate claims before writes", async () => {
    const pages = canonicalPages();
    pages[0]!.publications!.push(
      publication("page-privacy-stable", ContentContext.DeveloperPortal, "/privacy", { status: "draft" }),
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
