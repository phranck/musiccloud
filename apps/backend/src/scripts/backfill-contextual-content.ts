import { ContentContext, type ContentPublication } from "@musiccloud/shared";
import type { AdminRepository, ContentPageSummaryRow } from "../db/admin-repository.js";
import { closeRepository, getAdminRepository } from "../db/index.js";
import { normalizeEditorialPath } from "../services/editorial-path.js";

export interface ContextualContentBackfillResult {
  pages: number;
  publications: number;
  conflicts: number;
  writes: number;
}

interface BackfillAction {
  pageId: string;
  publications: ContentPublication[];
}

export async function backfillContextualContent(
  repo: AdminRepository,
  options: { dryRun: boolean },
): Promise<ContextualContentBackfillResult> {
  const pages = await repo.listContentPageSummaries();
  const claims = new Map<string, string>();
  for (const page of pages) {
    for (const publication of page.publications ?? []) {
      claims.set(`${publication.context}:${normalizeEditorialPath(publication.path)}`, publication.pageId);
    }
  }

  const actions: BackfillAction[] = [];
  let conflicts = 0;
  for (const page of pages) {
    const pageId = page.id;
    if (!pageId) {
      conflicts++;
      continue;
    }
    const desired = legacyFrontendPublication(page);
    const existing = page.publications ?? [];
    const existingFrontend = existing.find((publication) => publication.context === ContentContext.Frontend);
    const claimant = claims.get(`${ContentContext.Frontend}:${desired.path}`);
    if ((claimant && claimant !== pageId) || (existingFrontend && !samePublication(existingFrontend, desired))) {
      conflicts++;
      continue;
    }
    if (!existingFrontend) {
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

  const result: ContextualContentBackfillResult = {
    pages: pages.length,
    publications: pages.length,
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
  return result;
}

function legacyFrontendPublication(page: ContentPageSummaryRow): ContentPublication {
  return {
    context: ContentContext.Frontend,
    path: normalizeEditorialPath(page.slug),
    status: page.status,
    templateKey: "frontend-default",
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
  return `pages=${result.pages} publications=${result.publications} conflicts=${result.conflicts} writes=${result.writes}`;
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
