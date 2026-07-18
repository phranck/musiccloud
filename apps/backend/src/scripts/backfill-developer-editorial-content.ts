import { createHash } from "node:crypto";

import { ContentContext, type ContentPublication, type SingleContentContext } from "@musiccloud/shared";

import type {
  AdminRepository,
  ContentPageRow,
  ContentPublicationCutoverInput,
  ContentPublicationRow,
} from "../db/admin-repository.js";
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
    context: ContentContext.DeveloperPortal,
    path: "/privacy",
    status: "published",
    templateKey: "developer-default",
  }),
  Object.freeze({
    sourceSlug: "terms",
    context: ContentContext.DeveloperPortal,
    path: "/terms",
    status: "published",
    templateKey: "developer-default",
  }),
]);

export type DeveloperEditorialCutoverConflictCode =
  | "ambiguous-source"
  | "canonical-duplicate-claim"
  | "invalid-publication-path"
  | "missing-source"
  | "publication-owner-mismatch"
  | "reserved-developer-path"
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
  currentPublication: ContentPublication | null;
  desiredPublication: ContentPublication;
  outcome: "add" | "conflict" | "unchanged";
}

export interface DeveloperEditorialCutoverWrite {
  pageId: string;
  context: typeof ContentContext.DeveloperPortal;
  path: DeveloperEditorialCutoverMapping["path"];
}

export interface DeveloperEditorialCutoverReport {
  dryRun: boolean;
  counts: {
    pages: number;
    publications: number;
    mappings: number;
    plannedWrites: number;
    conflicts: number;
    writes: number;
  };
  mappings: DeveloperEditorialCutoverMappingReport[];
  conflicts: DeveloperEditorialCutoverConflict[];
  writes: DeveloperEditorialCutoverWrite[];
}

interface NormalizedPublicationClaim {
  ownerPageId: string;
  publication: ContentPublicationRow;
  normalizedPath: string;
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
  const conflicts: DeveloperEditorialCutoverConflict[] = [];
  const claimsByCanonicalRoute = new Map<string, NormalizedPublicationClaim[]>();

  for (const page of pages) {
    const ownerPageId = page.id;
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

      if (isDocsNamespace(normalizedPath)) {
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

  const mappingReports: DeveloperEditorialCutoverMappingReport[] = [];
  const cutoverEntries: ContentPublicationCutoverInput[] = [];
  let plannedWriteCount = 0;
  for (const mapping of DEVELOPER_EDITORIAL_CUTOVER_MAPPING) {
    const desiredPublication = toDesiredPublication(mapping);
    const sourceCandidates = pages.filter((page) => page.slug === mapping.sourceSlug);
    if (sourceCandidates.length === 0) {
      conflicts.push({
        code: "missing-source",
        context: mapping.context,
        pageIds: [],
        path: mapping.path,
        sourceSlug: mapping.sourceSlug,
      });
      mappingReports.push(unresolvedMappingReport(mapping, desiredPublication));
      continue;
    }
    if (sourceCandidates.length > 1) {
      conflicts.push({
        code: "ambiguous-source",
        context: mapping.context,
        pageIds: sourceCandidates.flatMap((page) => (page.id ? [page.id] : [])).sort(),
        path: mapping.path,
        sourceSlug: mapping.sourceSlug,
      });
      mappingReports.push(unresolvedMappingReport(mapping, desiredPublication));
      continue;
    }

    const sourceSummary = sourceCandidates[0]!;
    const pageId = sourceSummary.id;
    if (!pageId) {
      conflicts.push({
        code: "missing-source",
        context: mapping.context,
        pageIds: [],
        path: mapping.path,
        sourceSlug: mapping.sourceSlug,
      });
      mappingReports.push(unresolvedMappingReport(mapping, desiredPublication));
      continue;
    }

    const sourcePage = await repo.getContentPageById(pageId);
    if (!sourcePage || sourcePage.id !== pageId || sourcePage.slug !== mapping.sourceSlug) {
      conflicts.push({
        code: "source-identity-mismatch",
        context: mapping.context,
        pageIds: [pageId],
        path: mapping.path,
        sourceSlug: mapping.sourceSlug,
      });
      mappingReports.push({
        ...unresolvedMappingReport(mapping, desiredPublication),
        pageId,
      });
      continue;
    }

    const fingerprint = fingerprintPage(sourcePage);
    const targetPublications = (sourceSummary.publications ?? []).filter(
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
        pageIds: [pageId],
        path: mapping.path,
        sourceSlug: mapping.sourceSlug,
      });
      outcome = "conflict";
    } else if (targetPublications.length === 1) {
      outcome = "unchanged";
    }

    const otherRouteOwners = (claimsByCanonicalRoute.get(canonicalRouteKey(mapping.context, mapping.path)) ?? [])
      .map((claim) => claim.ownerPageId)
      .filter((ownerId) => ownerId !== pageId);
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

    cutoverEntries.push({
      sourceSlug: mapping.sourceSlug,
      pageId,
      publication: desiredPublication,
    });
    if (outcome === "add") {
      plannedWriteCount++;
    }
    mappingReports.push({
      sourceSlug: mapping.sourceSlug,
      pageId,
      fingerprint,
      currentPublication,
      desiredPublication,
      outcome,
    });
  }

  conflicts.sort(compareConflicts);
  const report: DeveloperEditorialCutoverReport = {
    dryRun: options.dryRun,
    counts: {
      pages: pages.length,
      publications: pages.reduce((count, page) => count + (page.publications?.length ?? 0), 0),
      mappings: DEVELOPER_EDITORIAL_CUTOVER_MAPPING.length,
      plannedWrites: plannedWriteCount,
      conflicts: conflicts.length,
      writes: 0,
    },
    mappings: mappingReports,
    conflicts,
    writes: [],
  };

  if (conflicts.length > 0) {
    if (options.dryRun) return report;
    throw new DeveloperEditorialCutoverConflictError(report);
  }
  if (options.dryRun) return report;

  const inserted = await repo.applyContentPublicationCutover(cutoverEntries);
  for (const row of inserted) {
    const entry = cutoverEntries.find(
      (candidate) => candidate.pageId === row.pageId && candidate.publication.context === row.context,
    );
    if (!entry) throw new Error("Cutover repository returned an unexpected publication");
    report.writes.push({
      pageId: row.pageId,
      context: ContentContext.DeveloperPortal,
      path: entry.publication.path as DeveloperEditorialCutoverMapping["path"],
    });
  }
  report.counts.writes = report.writes.length;
  return report;
}

function unresolvedMappingReport(
  mapping: DeveloperEditorialCutoverMapping,
  desiredPublication: ContentPublication,
): DeveloperEditorialCutoverMappingReport {
  return {
    sourceSlug: mapping.sourceSlug,
    pageId: null,
    fingerprint: null,
    currentPublication: null,
    desiredPublication,
    outcome: "conflict",
  };
}

function toDesiredPublication(mapping: DeveloperEditorialCutoverMapping): ContentPublication {
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

function fingerprintPage(page: ContentPageRow): string {
  return createHash("sha256").update(JSON.stringify({ title: page.title, content: page.content })).digest("hex");
}

function canonicalRouteKey(context: SingleContentContext, path: string): string {
  return `${context}:${path}`;
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
