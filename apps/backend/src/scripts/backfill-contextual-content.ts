import {
  ContentContext,
  expectedNavigationPlacements,
  hasAllContextBits,
  isNavigationSystemKey,
  isSafeConfiguredUrl,
  isValidContentContextMask,
  isValidNavigationAreaMask,
  NAVIGATION_SYSTEM_TARGETS,
  NavigationArea,
  NavigationSystemKey,
  NavigationTargetKind,
  type ContentPublication,
  type NavigationPlacement,
  PageType,
} from "@musiccloud/shared";
import type {
  AdminRepository,
  ContentPageSummaryRow,
  NavigationConfigurationEntryRow,
  NavigationConfigurationReplaceInput,
} from "../db/admin-repository.js";
import { closeRepository, getAdminRepository } from "../db/index.js";
import { isReservedDeveloperPortalPath, normalizeEditorialPath } from "../services/editorial-path.js";

export interface ContextualContentBackfillResult {
  pages: number;
  publications: number;
  navigationEntries: number;
  navigationPlacements: number;
  conflicts: number;
  writes: number;
}

interface BackfillAction {
  pageId: string;
  publications: ContentPublication[];
}

interface NavigationBackfillPlan {
  entries: NavigationConfigurationReplaceInput[];
  entryCount: number;
  placementCount: number;
  conflicts: number;
  write: boolean;
}

export async function backfillContextualContent(
  repo: AdminRepository,
  options: { dryRun: boolean },
): Promise<ContextualContentBackfillResult> {
  const pages = await repo.listContentPageSummaries();
  const claims = new Map<string, string>();
  let conflicts = 0;

  const registerClaim = (key: string, pageId: string): boolean => {
    if (claims.has(key)) {
      conflicts++;
      return false;
    }
    claims.set(key, pageId);
    return true;
  };

  for (const page of pages) {
    for (const publication of page.publications ?? []) {
      const normalizedPath = normalizeEditorialPath(publication.path);
      if (
        isDocsUrl(normalizedPath) ||
        (publication.context === ContentContext.DeveloperPortal && isReservedDeveloperPortalPath(normalizedPath))
      ) {
        conflicts++;
        continue;
      }
      registerClaim(`${publication.context}:${normalizedPath}`, page.id ?? publication.pageId);
    }
  }

  const actions: BackfillAction[] = [];
  for (const page of pages) {
    const pageId = page.id;
    if (!pageId) {
      conflicts++;
      continue;
    }
    const desired = legacyFrontendPublication(page);
    const existing = page.publications ?? [];
    const existingFrontend = existing.find((publication) => publication.context === ContentContext.Frontend);
    if (existingFrontend && !samePublication(existingFrontend, desired)) {
      conflicts++;
      continue;
    }
    if (!existingFrontend) {
      if (isDocsUrl(desired.path)) {
        conflicts++;
        continue;
      }
      if (!registerClaim(`${ContentContext.Frontend}:${desired.path}`, pageId)) continue;
      actions.push({
        pageId,
        publications: [
          desired,
          ...existing
            .filter((publication) => publication.context !== ContentContext.Frontend)
            .map(({ pageId: _pageId, ...publication }) => publication),
        ].sort((a, b) => a.context - b.context),
      });
    }
  }

  const navigationPlan =
    typeof repo.listNavigationConfiguration === "function"
      ? await planNavigationBackfill(repo, pages)
      : { entries: [], entryCount: 0, placementCount: 0, conflicts: 0, write: false };
  conflicts += navigationPlan.conflicts;

  const result: ContextualContentBackfillResult = {
    pages: pages.length,
    publications: pages.length,
    navigationEntries: navigationPlan.entryCount,
    navigationPlacements: navigationPlan.placementCount,
    conflicts,
    writes: 0,
  };
  if (conflicts > 0) {
    if (options.dryRun) return result;
    throw new Error(`Contextual content backfill conflict count: ${conflicts}`);
  }
  if (options.dryRun) return result;

  for (const action of actions) {
    await repo.replaceContentPublications(action.pageId, action.publications);
    result.writes++;
  }
  if (navigationPlan.write) {
    await repo.replaceNavigationConfiguration(navigationPlan.entries);
    result.writes++;
  }
  return result;
}

async function planNavigationBackfill(
  repo: AdminRepository,
  pages: ContentPageSummaryRow[],
): Promise<NavigationBackfillPlan> {
  const existing = await repo.listNavigationConfiguration();
  const hasPlacements = existing.some((entry) => entry.placements.length > 0);
  if (hasPlacements) return validateExistingNavigation(existing, pages);

  const [header, footer] = await Promise.all([
    repo.listAdminNavItems("header"),
    repo.listAdminNavItems("footer"),
  ]);
  const pagesBySlug = new Map(pages.map((page) => [page.slug, page]));

  let conflicts = 0;
  const positions = new Set<string>();
  const entries: NavigationConfigurationReplaceInput[] = [];
  for (const [navId, rows] of [
    ["header", header],
    ["footer", footer],
  ] as const) {
    const area = navId === "header" ? NavigationArea.Main : NavigationArea.Footer;
    for (const row of rows) {
      const positionKey = `${ContentContext.Frontend}:${area}:${row.position}`;
      if (positions.has(positionKey)) conflicts++;
      positions.add(positionKey);

      const placement: NavigationPlacement = {
        context: ContentContext.Frontend,
        area,
        position: row.position,
      };
      if (row.pageSlug) {
        const page = pagesBySlug.get(row.pageSlug);
        if (!page?.id || !page.contextMask || !hasAllContextBits(page.contextMask, ContentContext.Frontend)) {
          conflicts++;
          continue;
        }
        if (pageClaimsDocsNamespace(page)) {
          conflicts++;
          continue;
        }
        if (row.url !== null) conflicts++;
        entries.push({
          targetKind: NavigationTargetKind.Page,
          pageId: page.id,
          url: null,
          systemKey: null,
          target: row.target,
          label: row.label,
          contextMask: ContentContext.Frontend,
          areaMask: area,
          placements: [placement],
        });
        continue;
      }

      if (!row.url || !isSafeConfiguredUrl(row.url, { allowRelative: true, allowMailto: true }) || isDocsUrl(row.url)) {
        conflicts++;
        continue;
      }
      entries.push({
        targetKind: NavigationTargetKind.Url,
        pageId: null,
        url: row.url,
        systemKey: null,
        target: row.target,
        label: row.label,
        contextMask: ContentContext.Frontend,
        areaMask: area,
        placements: [placement],
      });
    }
  }

  const systemLabels: Record<NavigationSystemKey, string> = {
    [NavigationSystemKey.Docs]: "Docs",
    [NavigationSystemKey.ApiReference]: "API reference",
    [NavigationSystemKey.Search]: "Search",
  };
  for (const [position, systemKey] of [
    NavigationSystemKey.Docs,
    NavigationSystemKey.ApiReference,
    NavigationSystemKey.Search,
  ].entries()) {
    entries.push({
      targetKind: NavigationTargetKind.System,
      pageId: null,
      url: null,
      systemKey,
      target: NAVIGATION_SYSTEM_TARGETS[systemKey].target,
      label: systemLabels[systemKey],
      contextMask: ContentContext.DeveloperPortal,
      areaMask: NavigationArea.Main,
      placements: [{ context: ContentContext.DeveloperPortal, area: NavigationArea.Main, position }],
    });
  }

  return {
    entries,
    entryCount: entries.length,
    placementCount: entries.reduce((count, entry) => count + entry.placements.length, 0),
    conflicts,
    write: conflicts === 0,
  };
}

function validateExistingNavigation(
  existing: NavigationConfigurationEntryRow[],
  pages: ContentPageSummaryRow[],
): NavigationBackfillPlan {
  const pagesById = new Map(pages.filter((page) => page.id).map((page) => [page.id!, page]));
  const positions = new Set<string>();
  const systemKeys = new Set<NavigationSystemKey>();
  let conflicts = 0;

  for (const entry of existing) {
    if (!isValidContentContextMask(entry.contextMask) || !isValidNavigationAreaMask(entry.areaMask)) {
      conflicts++;
      continue;
    }
    const expected = new Set(
      expectedNavigationPlacements(entry.contextMask, entry.areaMask).map(
        (placement) => `${placement.context}:${placement.area}`,
      ),
    );
    const actual = new Set(entry.placements.map((placement) => `${placement.context}:${placement.area}`));
    if (
      entry.placements.length !== expected.size ||
      actual.size !== expected.size ||
      [...expected].some((key) => !actual.has(key))
    ) {
      conflicts++;
    }
    for (const placement of entry.placements) {
      const key = `${placement.context}:${placement.area}:${placement.position}`;
      if (!Number.isInteger(placement.position) || placement.position < 0 || positions.has(key)) conflicts++;
      positions.add(key);
    }

    if (entry.targetKind === NavigationTargetKind.System) {
      if (
        !isNavigationSystemKey(entry.systemKey) ||
        entry.pageId !== null ||
        entry.url !== null ||
        entry.target !== NAVIGATION_SYSTEM_TARGETS[entry.systemKey]?.target ||
        entry.contextMask !== ContentContext.DeveloperPortal ||
        systemKeys.has(entry.systemKey)
      ) {
        conflicts++;
        continue;
      }
      systemKeys.add(entry.systemKey);
      continue;
    }

    if (entry.systemKey !== null) conflicts++;
    if (entry.targetKind === NavigationTargetKind.Page) {
      const page = entry.pageId ? pagesById.get(entry.pageId) : undefined;
      if (
        !page?.contextMask ||
        !hasAllContextBits(page.contextMask, entry.contextMask) ||
        entry.url !== null ||
        pageClaimsDocsNamespace(page)
      ) {
        conflicts++;
      }
    } else if (
      entry.targetKind !== NavigationTargetKind.Url ||
      entry.pageId !== null ||
      !entry.url ||
      !isSafeConfiguredUrl(entry.url, { allowRelative: true, allowMailto: true }) ||
      isDocsUrl(entry.url)
    ) {
      conflicts++;
    }
  }

  for (const key of [NavigationSystemKey.Docs, NavigationSystemKey.ApiReference, NavigationSystemKey.Search]) {
    if (!systemKeys.has(key)) conflicts++;
  }

  return {
    entries: existing.map(({ id: _id, pageSlug: _pageSlug, pageTitle: _pageTitle, labelUpdatedAt: _at, ...entry }) =>
      entry,
    ),
    entryCount: existing.length,
    placementCount: existing.reduce((count, entry) => count + entry.placements.length, 0),
    conflicts,
    write: false,
  };
}

function isDocsUrl(url: string): boolean {
  if (!url.startsWith("/")) return false;
  try {
    const path = normalizeEditorialPath(new URL(url, "https://navigation.invalid").pathname);
    return path === "/docs" || path.startsWith("/docs/");
  } catch {
    return true;
  }
}

function pageClaimsDocsNamespace(page: ContentPageSummaryRow): boolean {
  return (
    (page.publications ?? []).some((publication) => isDocsUrl(publication.path)) ||
    isDocsUrl(legacyFrontendPublication(page).path)
  );
}

function legacyFrontendPublication(page: ContentPageSummaryRow): ContentPublication {
  return {
    context: ContentContext.Frontend,
    path: normalizeEditorialPath(page.slug),
    status: page.status,
    templateKey: page.pageType === PageType.Segmented ? "frontend-segmented" : "frontend-default",
  };
}

function samePublication(
  existing: { context: number; path: string; status: string; templateKey: string },
  desired: ContentPublication,
): boolean {
  return (
    existing.context === desired.context &&
    normalizeEditorialPath(existing.path) === desired.path &&
    existing.status === desired.status &&
    existing.templateKey === desired.templateKey
  );
}

export function formatBackfillSummary(result: ContextualContentBackfillResult): string {
  return `pages=${result.pages} publications=${result.publications} navigationEntries=${result.navigationEntries} navigationPlacements=${result.navigationPlacements} conflicts=${result.conflicts} writes=${result.writes}`;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const repo = await getAdminRepository();
  try {
    const result = await backfillContextualContent(repo, { dryRun });
    console.log(formatBackfillSummary(result));
  } finally {
    await closeRepository();
  }
}

if (process.argv[1]?.endsWith("backfill-contextual-content.ts")) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Contextual content backfill failed");
    process.exitCode = 1;
  });
}
