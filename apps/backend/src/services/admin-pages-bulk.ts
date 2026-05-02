// apps/backend/src/services/admin-pages-bulk.ts
import type { ContentPageSummary, PagesBulkErrorDetail, PagesBulkRequest } from "@musiccloud/shared";
import { isLocale, PAGE_TYPES } from "@musiccloud/shared";

import type { ContentPageMetaUpdate } from "../db/admin-repository.js";
import { getAdminRepository } from "../db/index.js";

import { getManagedContentPages } from "./admin-content.js";

export type BulkResult =
  | { ok: true; data: ContentPageSummary[] }
  | { ok: false; code: "INVALID_INPUT"; details: PagesBulkErrorDetail[] };

export interface BulkUpdateOpts {
  updatedBy: string | null;
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export async function bulkUpdatePages(
  payload: PagesBulkRequest,
  opts: BulkUpdateOpts,
): Promise<BulkResult> {
  const repo = await getAdminRepository();

  // Snapshot existing slugs+pageTypes for cross-checks
  const existingPages = await repo.listContentPageSummaries();
  const bySlug = new Map(existingPages.map((p) => [p.slug, p]));

  const errors: PagesBulkErrorDetail[] = [];

  // 1) pages: meta + content
  (payload.pages ?? []).forEach((entry, idx) => {
    if (!bySlug.has(entry.slug)) {
      errors.push({ section: "pages", index: idx, message: `unknown page '${entry.slug}'` });
      return;
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
  });

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

  // 3) pageTranslations
  (payload.pageTranslations ?? []).forEach((entry, idx) => {
    if (!bySlug.has(entry.slug)) {
      errors.push({ section: "pageTranslations", index: idx, message: `unknown page '${entry.slug}'` });
    }
    if (!isLocale(entry.locale)) {
      errors.push({ section: "pageTranslations", index: idx, message: "invalid locale" });
    }
    if (entry.title === undefined || entry.title === null || entry.title === "") {
      errors.push({ section: "pageTranslations", index: idx, message: "title is required" });
    }
  });

  // 4) topLevelOrder
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
    pages: (payload.pages ?? []).map((p) => ({
      slug: p.slug,
      meta: p.meta
        ? ({ ...(p.meta as ContentPageMetaUpdate), updatedBy: opts.updatedBy } as ContentPageMetaUpdate)
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
          ...(seg.translations ? { translations: seg.translations } : {}),
        })),
    })),
    pageTranslations: (payload.pageTranslations ?? []).map((t) => ({
      ...t,
      updatedBy: opts.updatedBy,
    })),
    topLevelOrder: payload.topLevelOrder ?? [],
  });

  // The adapter returns ContentPageSummaryRow[] (DB rows). The route contract
  // requires ContentPageSummary[] (with username resolution + translationStatus
  // shape). Reuse the existing read-side service to produce the correct DTOs.
  const data = await getManagedContentPages();
  return { ok: true, data };
}

function pendingPageType(payload: PagesBulkRequest, slug: string, current: string): string {
  const pending = payload.pages?.find((p) => p.slug === slug)?.meta?.pageType;
  return pending ?? current;
}
