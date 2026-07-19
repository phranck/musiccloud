// apps/backend/src/services/admin-pages-bulk.ts
import type {
  ContentPageSummary,
  ContentPublication,
  PagesBulkErrorDetail,
  PagesBulkRequest,
} from "@musiccloud/shared";
import { ContentContext, PAGE_TYPES } from "@musiccloud/shared";

import type { ContentPageMetaUpdate } from "../db/admin-repository.js";
import { getAdminRepository } from "../db/index.js";

import {
  contentContextRemovalNavigationError,
  getManagedContentPages,
  normalizeAndValidateContentPublications,
} from "./admin-content.js";
import { normalizeEditorialPath } from "./editorial-path.js";

export type BulkResult =
  | { ok: true; data: ContentPageSummary[] }
  | { ok: false; code: "INVALID_INPUT"; details: PagesBulkErrorDetail[] };

export interface BulkUpdateOpts {
  updatedBy: string | null;
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export async function bulkUpdatePages(payload: PagesBulkRequest, opts: BulkUpdateOpts): Promise<BulkResult> {
  const repo = await getAdminRepository();

  // Snapshot existing slugs+pageTypes for cross-checks
  const existingPages = await repo.listContentPageSummaries();
  const bySlug = new Map(existingPages.map((p) => [p.slug, p]));
  const detailedPages = await Promise.all(existingPages.map((page) => repo.getContentPageBySlug(page.slug)));
  const detailsBySlug = new Map(detailedPages.filter((page) => page !== null).map((page) => [page.slug, page]));

  const errors: PagesBulkErrorDetail[] = [];
  const normalizedPublications = new Map<number, ContentPublication[]>();
  let navigationEntries: Awaited<ReturnType<typeof repo.listNavigationConfiguration>> | undefined;

  // 1) pages: meta + content
  const pageEntries = payload.pages ?? [];
  for (let idx = 0; idx < pageEntries.length; idx++) {
    const entry = pageEntries[idx]!;
    if (!bySlug.has(entry.slug)) {
      errors.push({ section: "pages", index: idx, message: `unknown page '${entry.slug}'` });
      continue;
    }
    if (entry.meta?.slug !== undefined && entry.meta.slug !== entry.slug) {
      if (!SLUG_RE.test(entry.meta.slug)) {
        errors.push({ section: "pages", index: idx, message: "invalid slug pattern" });
      }
      if (bySlug.has(entry.meta.slug)) {
        errors.push({ section: "pages", index: idx, message: "target slug already exists" });
      }
    }
    if (entry.meta?.pageType !== undefined && !PAGE_TYPES.includes(entry.meta.pageType)) {
      errors.push({ section: "pages", index: idx, message: "invalid pageType" });
    }
    const current = detailsBySlug.get(entry.slug);
    if (
      current &&
      (entry.meta?.slug !== undefined ||
        entry.meta?.status !== undefined ||
        entry.meta?.contextMask !== undefined ||
        entry.meta?.publications !== undefined ||
        entry.content !== undefined)
    ) {
      const contextMask = entry.meta?.contextMask ?? current.contextMask ?? ContentContext.Frontend;
      const currentContextMask = current.contextMask ?? ContentContext.Frontend;
      if ((currentContextMask & ~contextMask) !== 0 && current.id) {
        navigationEntries ??= await repo.listNavigationConfiguration();
        const navigationError = contentContextRemovalNavigationError(
          navigationEntries,
          current.id,
          currentContextMask,
          contextMask,
        );
        if (navigationError) {
          errors.push({
            section: "pages",
            index: idx,
            message: navigationError,
          });
        }
      }
      const renamesLegacyPath = entry.meta?.slug !== undefined && entry.meta.slug !== entry.slug;
      const publications =
        entry.meta?.publications ??
        (current.publications && current.publications.length > 0
          ? current.publications.map(({ pageId: _pageId, ...publication }) => publication)
          : [
              {
                context: ContentContext.Frontend,
                path: normalizeEditorialPath(current.slug),
                status: current.status,
                templateKey: "frontend-default",
              },
            ]
        ).map((publication) => {
          const renamed =
            renamesLegacyPath && publication.path === normalizeEditorialPath(current.slug)
              ? { ...publication, path: normalizeEditorialPath(entry.meta!.slug!) }
              : publication;
          return entry.meta?.status !== undefined && renamed.context === ContentContext.Frontend
            ? { ...renamed, status: entry.meta.status }
            : renamed;
        });
      const validation = normalizeAndValidateContentPublications(
        contextMask,
        publications,
        entry.content ?? current.content,
      );
      if (typeof validation === "string") {
        errors.push({ section: "pages", index: idx, message: validation });
      } else {
        normalizedPublications.set(idx, validation);
      }
    }
  }

  // 2) segments: target validation
  (payload.segments ?? []).forEach((entry, idx) => {
    const owner = bySlug.get(entry.ownerSlug);
    if (!owner) {
      errors.push({ section: "segments", index: idx, message: `unknown owner '${entry.ownerSlug}'` });
      return;
    }
    // owner pageType is checked AFTER pages-meta is applied virtually:
    const futureType = pendingPageType(payload, entry.ownerSlug, owner.pageType);
    if (futureType !== "segmented") {
      errors.push({ section: "segments", index: idx, message: "owner is not segmented" });
    }
    entry.segments.forEach((s, sIdx) => {
      if (!s.label.trim()) {
        errors.push({ section: "segments", index: idx, message: `segment[${sIdx}] empty label` });
      }
      if (s.targetSlug === entry.ownerSlug) {
        errors.push({ section: "segments", index: idx, message: `segment[${sIdx}] self-reference` });
      }
      const target = bySlug.get(s.targetSlug);
      if (!target) {
        errors.push({
          section: "segments",
          index: idx,
          message: `segment[${sIdx}] unknown target '${s.targetSlug}'`,
        });
      } else if (pendingPageType(payload, s.targetSlug, target.pageType) !== "default") {
        errors.push({ section: "segments", index: idx, message: `segment[${sIdx}] target must be default` });
      }
    });
  });

  // 3) topLevelOrder
  if (payload.topLevelOrder) {
    payload.topLevelOrder.forEach((slug, idx) => {
      const p = bySlug.get(slug);
      if (!p) {
        errors.push({ section: "topLevelOrder", index: idx, message: `unknown page '${slug}'` });
      } else if (pendingPageType(payload, slug, p.pageType) !== "segmented") {
        errors.push({ section: "topLevelOrder", index: idx, message: "page is not segmented" });
      }
    });
  }

  if (errors.length > 0) return { ok: false, code: "INVALID_INPUT", details: errors };

  await repo.bulkUpdatePages({
    pages: (payload.pages ?? []).map((p, index) => ({
      slug: p.slug,
      meta:
        p.meta || normalizedPublications.has(index)
          ? ({
              ...(p.meta as ContentPageMetaUpdate | undefined),
              ...(normalizedPublications.has(index) ? { publications: normalizedPublications.get(index) } : {}),
              updatedBy: opts.updatedBy,
            } as ContentPageMetaUpdate)
          : undefined,
      content: p.content,
    })),
    segments: (payload.segments ?? []).map((s) => ({
      ownerSlug: s.ownerSlug,
      segments: s.segments
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((seg, i) => ({
          position: i,
          label: seg.label.trim(),
          targetSlug: seg.targetSlug,
        })),
    })),
    topLevelOrder: payload.topLevelOrder ?? [],
  });

  // The adapter returns ContentPageSummaryRow[] (DB rows). The route contract
  // requires ContentPageSummary[] with username resolution. Reuse the existing
  // read-side service to produce the correct DTOs.
  const data = await getManagedContentPages();
  return { ok: true, data };
}

function pendingPageType(payload: PagesBulkRequest, slug: string, current: string): string {
  const pending = payload.pages?.find((p) => p.slug === slug)?.meta?.pageType;
  return pending ?? current;
}
