import { ContentContext, type ContentPublication, type SingleContentContext } from "@musiccloud/shared";

import type {
  AdminRepository,
  ContentPageSummaryRow,
  ContentPublicationCutoverInput,
  ContentPublicationCutoverResult,
  ContentPublicationRow,
} from "../db/admin-repository.js";
import { ContentPublicationCutoverConflictError } from "../db/admin-repository.js";
import {
  fingerprintContentPage,
  PRIVACY_DEVELOPER_PUBLICATION,
  PRIVACY_FRONTEND_PREREQUISITE,
  TERMS_DEVELOPER_PUBLICATION,
  TERMS_BOOTSTRAP_PAGE,
  TERMS_FRONTEND_PUBLICATION,
} from "../db/content-publication-cutover.js";
import { closeRepository, getAdminRepository } from "../db/index.js";
import { isReservedDeveloperPortalPath, normalizeEditorialPath } from "../services/editorial-path.js";

export interface DeveloperEditorialCutoverMapping {
  readonly sourceSlug: "privacy" | "terms";
  readonly context: typeof ContentContext.DeveloperPortal;
  readonly path: "/privacy" | "/terms";
  readonly status: "published";
  readonly templateKey: "developer-default";
}

export const DEVELOPER_EDITORIAL_CUTOVER_MAPPING: readonly DeveloperEditorialCutoverMapping[] = Object.freeze([
  Object.freeze({
    sourceSlug: "privacy",
    ...PRIVACY_DEVELOPER_PUBLICATION,
  }),
  Object.freeze({
    sourceSlug: "terms",
    ...TERMS_DEVELOPER_PUBLICATION,
  }),
]);

export { TERMS_BOOTSTRAP_PAGE } from "../db/content-publication-cutover.js";

interface ContentCutoverMapping {
  readonly sourceSlug: DeveloperEditorialCutoverMapping["sourceSlug"];
  readonly context: SingleContentContext;
  readonly path: DeveloperEditorialCutoverMapping["path"];
  readonly status: "published";
  readonly templateKey: "frontend-default" | "developer-default";
}

const CONTENT_CUTOVER_MAPPING: readonly ContentCutoverMapping[] = Object.freeze([
  DEVELOPER_EDITORIAL_CUTOVER_MAPPING[0]!,
  Object.freeze({
    sourceSlug: "terms",
    ...TERMS_FRONTEND_PUBLICATION,
  }),
  DEVELOPER_EDITORIAL_CUTOVER_MAPPING[1]!,
]);

export type DeveloperEditorialCutoverConflictCode =
  | "ambiguous-source"
  | "canonical-duplicate-claim"
  | "context-mask-mismatch"
  | "invalid-publication-path"
  | "missing-source"
  | "privacy-frontend-prerequisite-mismatch"
  | "publication-owner-mismatch"
  | "reserved-developer-path"
  | "locked-revalidation-conflict"
  | "source-identity-mismatch"
  | "target-publication-mismatch"
  | "target-route-claimed";

export interface DeveloperEditorialCutoverConflict {
  code: DeveloperEditorialCutoverConflictCode;
  context: SingleContentContext | null;
  pageIds: string[];
  path: string | null;
  sourceSlug: string | null;
}

export interface DeveloperEditorialCutoverMappingReport {
  sourceSlug: DeveloperEditorialCutoverMapping["sourceSlug"];
  pageId: string | null;
  fingerprint: string | null;
  context: SingleContentContext;
  currentPublication: ContentPublication | null;
  desiredPublication: ContentPublication;
  outcome: "add" | "conflict" | "unchanged";
}

export interface DeveloperEditorialCutoverPagePlan {
  sourceSlug: DeveloperEditorialCutoverMapping["sourceSlug"];
  pageId: string | null;
  fingerprint: string | null;
  outcome: "conflict" | "create" | "existing";
}

export interface DeveloperEditorialCutoverCreatedPage {
  sourceSlug: "terms";
  pageId: string;
  fingerprint: string;
}

export interface DeveloperEditorialCutoverWrite {
  pageId: string;
  context: SingleContentContext;
  path: DeveloperEditorialCutoverMapping["path"];
}

export interface DeveloperEditorialCutoverReport {
  dryRun: boolean;
  counts: {
    pages: number;
    publications: number;
    navigationEntries: number;
    navigationPlacements: number;
    mappings: number;
    plannedPageCreates: number;
    plannedPublicationWrites: number;
    plannedWrites: number;
    conflicts: number;
    pageCreates: number;
    publicationWrites: number;
    writes: number;
  };
  pagePlans: DeveloperEditorialCutoverPagePlan[];
  mappings: DeveloperEditorialCutoverMappingReport[];
  conflicts: DeveloperEditorialCutoverConflict[];
  createdPages: DeveloperEditorialCutoverCreatedPage[];
  writes: DeveloperEditorialCutoverWrite[];
}

interface NormalizedPublicationClaim {
  ownerPageId: string;
  publication: ContentPublicationRow;
  normalizedPath: string;
}

interface ResolvedCutoverPage {
  summary: ContentPageSummaryRow | null;
  pageId: string | null;
  fingerprint: string | null;
  outcome: DeveloperEditorialCutoverPagePlan["outcome"];
  expectedPage: ContentPublicationCutoverInput["expectedPage"] | null;
}

export class DeveloperEditorialCutoverConflictError extends Error {
  constructor(readonly report: DeveloperEditorialCutoverReport) {
    super("Developer editorial cutover conflicts detected");
    this.name = "DeveloperEditorialCutoverConflictError";
  }
}

export async function backfillDeveloperEditorialContent(
  repo: AdminRepository,
  options: { dryRun: boolean },
): Promise<DeveloperEditorialCutoverReport> {
  const pages = await repo.listContentPageSummaries();
  const navigationEntries = await repo.listNavigationConfiguration();
  const conflicts: DeveloperEditorialCutoverConflict[] = [];
  const claimsByCanonicalRoute = new Map<string, NormalizedPublicationClaim[]>();

  for (const page of pages) {
    const ownerPageId = page.id;
    if (page.contextMask !== publicationContextMask(page.publications ?? [])) {
      conflicts.push({
        code: "context-mask-mismatch",
        context: null,
        pageIds: ownerPageId ? [ownerPageId] : [],
        path: null,
        sourceSlug: page.slug,
      });
    }
    for (const publication of page.publications ?? []) {
      if (!ownerPageId || publication.pageId !== ownerPageId) {
        conflicts.push({
          code: "publication-owner-mismatch",
          context: publication.context,
          pageIds: [ownerPageId, publication.pageId].filter((id): id is string => Boolean(id)).sort(),
          path: publication.path,
          sourceSlug: page.slug,
        });
      }

      let normalizedPath: string;
      try {
        normalizedPath = normalizeEditorialPath(publication.path);
      } catch {
        conflicts.push({
          code: "invalid-publication-path",
          context: publication.context,
          pageIds: ownerPageId ? [ownerPageId] : [],
          path: publication.path,
          sourceSlug: page.slug,
        });
        continue;
      }

      const routeKey = canonicalRouteKey(publication.context, normalizedPath);
      const routeClaims = claimsByCanonicalRoute.get(routeKey) ?? [];
      routeClaims.push({ ownerPageId: ownerPageId ?? publication.pageId, publication, normalizedPath });
      claimsByCanonicalRoute.set(routeKey, routeClaims);

      if (publication.context === ContentContext.DeveloperPortal && isDocsNamespace(normalizedPath)) {
        conflicts.push({
          code: "reserved-developer-path",
          context: publication.context,
          pageIds: ownerPageId ? [ownerPageId] : [],
          path: normalizedPath,
          sourceSlug: page.slug,
        });
      }
    }
  }

  for (const claims of claimsByCanonicalRoute.values()) {
    if (claims.length < 2) continue;
    conflicts.push({
      code: "canonical-duplicate-claim",
      context: claims[0]!.publication.context,
      pageIds: [...new Set(claims.map((claim) => claim.ownerPageId))].sort(),
      path: claims[0]!.normalizedPath,
      sourceSlug: null,
    });
  }

  const resolvedPages = new Map<DeveloperEditorialCutoverMapping["sourceSlug"], ResolvedCutoverPage>();
  const pagePlans: DeveloperEditorialCutoverPagePlan[] = [];
  for (const sourceSlug of ["privacy", "terms"] as const) {
    const sourceCandidates = pages.filter((page) => page.slug === sourceSlug);
    if (sourceCandidates.length === 0 && sourceSlug === "terms") {
      const fingerprint = fingerprintContentPage(TERMS_BOOTSTRAP_PAGE);
      const expectedPage: ContentPublicationCutoverInput["expectedPage"] = {
        kind: "absent",
        fingerprint,
        create: TERMS_BOOTSTRAP_PAGE,
      };
      resolvedPages.set(sourceSlug, {
        summary: null,
        pageId: null,
        fingerprint,
        outcome: "create",
        expectedPage,
      });
      pagePlans.push({ sourceSlug, pageId: null, fingerprint, outcome: "create" });
      continue;
    }

    if (sourceCandidates.length !== 1) {
      conflicts.push({
        code: sourceCandidates.length === 0 ? "missing-source" : "ambiguous-source",
        context: ContentContext.DeveloperPortal,
        pageIds: sourceCandidates.flatMap((page) => (page.id ? [page.id] : [])).sort(),
        path: `/${sourceSlug}`,
        sourceSlug,
      });
      resolvedPages.set(sourceSlug, {
        summary: null,
        pageId: null,
        fingerprint: null,
        outcome: "conflict",
        expectedPage: null,
      });
      pagePlans.push({ sourceSlug, pageId: null, fingerprint: null, outcome: "conflict" });
      continue;
    }

    const sourceSummary = sourceCandidates[0]!;
    const pageId = sourceSummary.id;
    if (!pageId) {
      conflicts.push({
        code: "missing-source",
        context: ContentContext.DeveloperPortal,
        pageIds: [],
        path: `/${sourceSlug}`,
        sourceSlug,
      });
      resolvedPages.set(sourceSlug, {
        summary: sourceSummary,
        pageId: null,
        fingerprint: null,
        outcome: "conflict",
        expectedPage: null,
      });
      pagePlans.push({ sourceSlug, pageId: null, fingerprint: null, outcome: "conflict" });
      continue;
    }

    const sourcePage = await repo.getContentPageById(pageId);
    if (!sourcePage || sourcePage.id !== pageId || sourcePage.slug !== sourceSlug) {
      conflicts.push({
        code: "source-identity-mismatch",
        context: ContentContext.DeveloperPortal,
        pageIds: [pageId],
        path: `/${sourceSlug}`,
        sourceSlug,
      });
      resolvedPages.set(sourceSlug, {
        summary: sourceSummary,
        pageId,
        fingerprint: null,
        outcome: "conflict",
        expectedPage: null,
      });
      pagePlans.push({ sourceSlug, pageId, fingerprint: null, outcome: "conflict" });
      continue;
    }

    const fingerprint = fingerprintContentPage(sourcePage);
    resolvedPages.set(sourceSlug, {
      summary: sourceSummary,
      pageId,
      fingerprint,
      outcome: "existing",
      expectedPage: { kind: "existing", pageId, fingerprint },
    });
    pagePlans.push({ sourceSlug, pageId, fingerprint, outcome: "existing" });
  }

  const resolvedPrivacyPage = resolvedPages.get("privacy")!;
  if (resolvedPrivacyPage.expectedPage && resolvedPrivacyPage.pageId) {
    const privacyFrontendPublications = (resolvedPrivacyPage.summary?.publications ?? []).filter(
      (publication) => publication.context === ContentContext.Frontend,
    );
    if (
      privacyFrontendPublications.length !== 1 ||
      !samePublication(privacyFrontendPublications[0]!, PRIVACY_FRONTEND_PREREQUISITE)
    ) {
      conflicts.push({
        code: "privacy-frontend-prerequisite-mismatch",
        context: ContentContext.Frontend,
        pageIds: [resolvedPrivacyPage.pageId],
        path: PRIVACY_FRONTEND_PREREQUISITE.path,
        sourceSlug: "privacy",
      });
    }
  }

  const mappingReports: DeveloperEditorialCutoverMappingReport[] = [];
  let plannedPublicationWriteCount = 0;
  for (const mapping of CONTENT_CUTOVER_MAPPING) {
    const desiredPublication = toDesiredPublication(mapping);
    const resolvedPage = resolvedPages.get(mapping.sourceSlug)!;
    if (!resolvedPage.expectedPage) {
      mappingReports.push(unresolvedMappingReport(mapping, desiredPublication));
      continue;
    }

    const targetPublications = (resolvedPage.summary?.publications ?? []).filter(
      (publication) => publication.context === mapping.context,
    );
    const currentPublication = targetPublications[0] ? withoutPageId(targetPublications[0]) : null;
    let outcome: DeveloperEditorialCutoverMappingReport["outcome"] = "add";

    if (
      targetPublications.length !== 0 &&
      (targetPublications.length !== 1 || !samePublication(targetPublications[0]!, desiredPublication))
    ) {
      conflicts.push({
        code: "target-publication-mismatch",
        context: mapping.context,
        pageIds: resolvedPage.pageId ? [resolvedPage.pageId] : [],
        path: mapping.path,
        sourceSlug: mapping.sourceSlug,
      });
      outcome = "conflict";
    } else if (targetPublications.length === 1) {
      outcome = "unchanged";
    }

    const otherRouteOwners = (claimsByCanonicalRoute.get(canonicalRouteKey(mapping.context, mapping.path)) ?? [])
      .map((claim) => claim.ownerPageId)
      .filter((ownerId) => ownerId !== resolvedPage.pageId);
    if (otherRouteOwners.length > 0) {
      conflicts.push({
        code: "target-route-claimed",
        context: mapping.context,
        pageIds: [...new Set(otherRouteOwners)].sort(),
        path: mapping.path,
        sourceSlug: mapping.sourceSlug,
      });
      outcome = "conflict";
    }

    if (outcome === "add") plannedPublicationWriteCount++;
    mappingReports.push({
      sourceSlug: mapping.sourceSlug,
      pageId: resolvedPage.pageId,
      fingerprint: resolvedPage.fingerprint,
      context: mapping.context,
      currentPublication,
      desiredPublication,
      outcome,
    });
  }

  const cutoverEntries: ContentPublicationCutoverInput[] = [];
  for (const sourceSlug of ["privacy", "terms"] as const) {
    const resolvedPage = resolvedPages.get(sourceSlug)!;
    if (!resolvedPage.expectedPage) continue;
    cutoverEntries.push({
      sourceSlug,
      expectedPage: resolvedPage.expectedPage,
      prerequisitePublications: sourceSlug === "privacy" ? [{ ...PRIVACY_FRONTEND_PREREQUISITE }] : [],
      publications: CONTENT_CUTOVER_MAPPING.filter((mapping) => mapping.sourceSlug === sourceSlug).map(
        toDesiredPublication,
      ),
    });
  }

  conflicts.sort(compareConflicts);
  const plannedPageCreateCount = pagePlans.filter((plan) => plan.outcome === "create").length;
  const report: DeveloperEditorialCutoverReport = {
    dryRun: options.dryRun,
    counts: {
      pages: pages.length,
      publications: pages.reduce((count, page) => count + (page.publications?.length ?? 0), 0),
      navigationEntries: navigationEntries.length,
      navigationPlacements: navigationEntries.reduce((count, entry) => count + entry.placements.length, 0),
      mappings: CONTENT_CUTOVER_MAPPING.length,
      plannedPageCreates: plannedPageCreateCount,
      plannedPublicationWrites: plannedPublicationWriteCount,
      plannedWrites: plannedPageCreateCount + plannedPublicationWriteCount,
      conflicts: conflicts.length,
      pageCreates: 0,
      publicationWrites: 0,
      writes: 0,
    },
    pagePlans,
    mappings: mappingReports,
    conflicts,
    createdPages: [],
    writes: [],
  };

  if (conflicts.length > 0) {
    if (options.dryRun) return report;
    throw new DeveloperEditorialCutoverConflictError(report);
  }
  if (options.dryRun) return report;

  let inserted: ContentPublicationCutoverResult;
  try {
    inserted = await repo.applyContentPublicationCutover(cutoverEntries);
  } catch (error) {
    if (!(error instanceof ContentPublicationCutoverConflictError)) throw error;
    report.conflicts.push({
      code: "locked-revalidation-conflict",
      context: null,
      pageIds: [],
      path: null,
      sourceSlug: null,
    });
    report.conflicts.sort(compareConflicts);
    report.counts.conflicts = report.conflicts.length;
    throw new DeveloperEditorialCutoverConflictError(report);
  }
  for (const created of inserted.createdPages) {
    if (created.sourceSlug !== "terms") throw new Error("Cutover repository created an unexpected Page");
    report.createdPages.push({ ...created, sourceSlug: "terms" });
    for (const mapping of report.mappings) {
      if (mapping.sourceSlug === created.sourceSlug) mapping.pageId = created.pageId;
    }
  }
  for (const row of inserted.publications) {
    const entry = cutoverEntries.find((candidate) => {
      const expectedPageId =
        candidate.expectedPage.kind === "existing"
          ? candidate.expectedPage.pageId
          : inserted.createdPages.find((created) => created.sourceSlug === candidate.sourceSlug)?.pageId;
      return (
        expectedPageId === row.pageId &&
        candidate.publications.some((publication) => publication.context === row.context)
      );
    });
    const publication = entry?.publications.find((candidate) => candidate.context === row.context);
    if (!entry || !publication) throw new Error("Cutover repository returned an unexpected publication");
    report.writes.push({
      pageId: row.pageId,
      context: row.context,
      path: publication.path as DeveloperEditorialCutoverMapping["path"],
    });
  }
  report.counts.pageCreates = report.createdPages.length;
  report.counts.publicationWrites = report.writes.length;
  report.counts.writes = report.counts.pageCreates + report.counts.publicationWrites;
  return report;
}

function unresolvedMappingReport(
  mapping: ContentCutoverMapping,
  desiredPublication: ContentPublication,
): DeveloperEditorialCutoverMappingReport {
  return {
    sourceSlug: mapping.sourceSlug,
    pageId: null,
    fingerprint: null,
    context: mapping.context,
    currentPublication: null,
    desiredPublication,
    outcome: "conflict",
  };
}

function toDesiredPublication(mapping: ContentCutoverMapping): ContentPublication {
  return {
    context: mapping.context,
    path: normalizeEditorialPath(mapping.path),
    status: mapping.status,
    templateKey: mapping.templateKey,
  };
}

function withoutPageId(publication: ContentPublicationRow): ContentPublication {
  return {
    context: publication.context,
    path: publication.path,
    status: publication.status,
    templateKey: publication.templateKey,
  };
}

function samePublication(current: ContentPublicationRow, desired: ContentPublication): boolean {
  return (
    current.context === desired.context &&
    current.path === desired.path &&
    current.status === desired.status &&
    current.templateKey === desired.templateKey
  );
}

function canonicalRouteKey(context: SingleContentContext, path: string): string {
  return `${context}:${path}`;
}

function publicationContextMask(publications: ReadonlyArray<Pick<ContentPublication, "context">>): number {
  return publications.reduce((mask, publication) => mask | publication.context, 0);
}

function isDocsNamespace(path: string): boolean {
  return isReservedDeveloperPortalPath(path) && (path === "/docs" || path.startsWith("/docs/"));
}

function compareConflicts(left: DeveloperEditorialCutoverConflict, right: DeveloperEditorialCutoverConflict): number {
  return (
    left.code.localeCompare(right.code) ||
    (left.sourceSlug ?? "").localeCompare(right.sourceSlug ?? "") ||
    (left.path ?? "").localeCompare(right.path ?? "") ||
    left.pageIds.join("\0").localeCompare(right.pageIds.join("\0"))
  );
}

export function formatDeveloperEditorialCutoverReport(report: DeveloperEditorialCutoverReport): string {
  return JSON.stringify(report, null, 2);
}

/** Detects direct execution of a compiled CommonJS cutover CLI. */
export function isDirectCommonJsCutoverEntrypoint(
  currentModule: NodeModule | undefined,
  mainModule: NodeModule | undefined,
): boolean {
  return currentModule !== undefined && currentModule === mainModule;
}

/** Detects direct source execution through `tsx` without relying on `import.meta.url`. */
export function isDirectTsxCutoverEntrypoint(argvEntry: string | undefined): boolean {
  if (!argvEntry) return false;
  const normalizedEntry = argvEntry.replaceAll("\\", "/");
  const sourceName = "backfill-developer-editorial-content.ts";
  return normalizedEntry === sourceName || normalizedEntry.endsWith(`/${sourceName}`);
}

function parseDryRun(argv: string[]): boolean {
  const dryRun = argv.includes("--dry-run");
  const apply = argv.includes("--apply");
  if (dryRun && apply) throw new Error("Choose either --dry-run or --apply");
  return !apply;
}

async function main(): Promise<void> {
  const dryRun = parseDryRun(process.argv.slice(2));
  const repo = await getAdminRepository();
  try {
    const report = await backfillDeveloperEditorialContent(repo, { dryRun });
    console.log(formatDeveloperEditorialCutoverReport(report));
  } finally {
    await closeRepository();
  }
}

const currentCommonJsModule = typeof module !== "undefined" ? module : undefined;
const mainCommonJsModule = typeof require !== "undefined" ? require.main : undefined;
if (
  isDirectCommonJsCutoverEntrypoint(currentCommonJsModule, mainCommonJsModule) ||
  isDirectTsxCutoverEntrypoint(process.argv[1])
) {
  void main().catch((error: unknown) => {
    if (error instanceof DeveloperEditorialCutoverConflictError) {
      console.error(formatDeveloperEditorialCutoverReport(error.report));
    }
    console.error("Developer editorial cutover failed");
    process.exitCode = 1;
  });
}
