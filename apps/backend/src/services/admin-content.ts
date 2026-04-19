import type {
  ContentPage,
  ContentPageSummary,
  ContentStatus,
  PageSegment,
  PageType,
  PublicContentPage,
  PublicPageSegment,
} from "@musiccloud/shared";
import { OVERLAY_HEIGHTS, OVERLAY_WIDTHS, PAGE_DISPLAY_MODES, PAGE_TYPES } from "@musiccloud/shared";
import { marked } from "marked";

import type {
  ContentPageMetaUpdate,
  ContentPageRow,
  ContentPageSummaryRow,
  PageSegmentRow,
} from "../db/admin-repository.js";
import { getAdminRepository } from "../db/index.js";

const SLUG_PATTERN = /^[a-z0-9-]+$/;
const SLUG_MAX_LEN = 100;
const TITLE_MAX_LEN = 200;
const CONTENT_MAX_LEN = 100_000;

export type ContentResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: "NOT_FOUND" | "SLUG_TAKEN" | "INVALID_INPUT"; message: string };

function isOneOf<T extends readonly string[]>(list: T, v: unknown): v is T[number] {
  return typeof v === "string" && (list as readonly string[]).includes(v);
}

function renderBody(content: string): string {
  return marked.parse(content, { async: false }) as string;
}

function segmentRowToDto(row: PageSegmentRow): PageSegment {
  return { id: row.id, position: row.position, label: row.label, targetSlug: row.targetSlug };
}

function rowToSummary(row: ContentPageSummaryRow, usernames: Map<string, string>): ContentPageSummary {
  return {
    slug: row.slug,
    title: row.title,
    status: row.status,
    showTitle: row.showTitle,
    pageType: row.pageType,
    displayMode: row.displayMode,
    overlayWidth: row.overlayWidth,
    overlayHeight: row.overlayHeight,
    createdByUsername: row.createdBy ? (usernames.get(row.createdBy) ?? null) : null,
    updatedByUsername: row.updatedBy ? (usernames.get(row.updatedBy) ?? null) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
  };
}

function rowToPage(row: ContentPageRow, usernames: Map<string, string>, segments: PageSegment[]): ContentPage {
  return { ...rowToSummary(row, usernames), content: row.content, segments };
}

export async function getManagedContentPages(): Promise<ContentPageSummary[]> {
  const repo = await getAdminRepository();
  const rows = await repo.listContentPageSummaries();
  const userIds = rows.flatMap((r) => [r.createdBy, r.updatedBy]).filter((id): id is string => id !== null);
  const usernames = await repo.getAdminUsernamesByIds(userIds);
  return rows.map((row) => rowToSummary(row, usernames));
}

export async function getManagedContentPage(slug: string): Promise<ContentResult<ContentPage>> {
  const repo = await getAdminRepository();
  const row = await repo.getContentPageBySlug(slug);
  if (!row) return { ok: false, code: "NOT_FOUND", message: "Content page not found" };
  const userIds = [row.createdBy, row.updatedBy].filter((id): id is string => id !== null);
  const usernames = await repo.getAdminUsernamesByIds(userIds);
  const segments = row.pageType === "segmented" ? (await repo.listSegmentsForOwner(row.slug)).map(segmentRowToDto) : [];
  return { ok: true, data: rowToPage(row, usernames, segments) };
}

export async function createManagedContentPage(data: {
  slug: string;
  title: string;
  status?: ContentStatus;
  pageType?: PageType;
  createdBy: string | null;
}): Promise<ContentResult<ContentPage>> {
  if (!data.slug || data.slug.length > SLUG_MAX_LEN || !SLUG_PATTERN.test(data.slug)) {
    return { ok: false, code: "INVALID_INPUT", message: "slug must match /^[a-z0-9-]+$/ (max 100 chars)" };
  }
  if (!data.title || data.title.length > TITLE_MAX_LEN) {
    return { ok: false, code: "INVALID_INPUT", message: "title required (max 200 chars)" };
  }
  if (data.status && !["draft", "published", "hidden"].includes(data.status)) {
    return { ok: false, code: "INVALID_INPUT", message: "status must be draft, published, or hidden" };
  }
  if (data.pageType !== undefined && !isOneOf(PAGE_TYPES, data.pageType)) {
    return { ok: false, code: "INVALID_INPUT", message: "pageType must be 'default' or 'segmented'" };
  }
  const repo = await getAdminRepository();
  if (await repo.contentPageSlugExists(data.slug)) {
    return { ok: false, code: "SLUG_TAKEN", message: "A page with this slug already exists" };
  }
  const row = await repo.createContentPage(data);
  const usernames = data.createdBy ? await repo.getAdminUsernamesByIds([data.createdBy]) : new Map();
  return { ok: true, data: rowToPage(row, usernames, []) };
}

export async function updateManagedContentPageMeta(
  slug: string,
  data: ContentPageMetaUpdate,
): Promise<ContentResult<ContentPage>> {
  if (data.title !== undefined && (data.title.length === 0 || data.title.length > TITLE_MAX_LEN)) {
    return { ok: false, code: "INVALID_INPUT", message: "title must be non-empty (max 200 chars)" };
  }
  if (
    data.slug !== undefined &&
    (data.slug.length === 0 || data.slug.length > SLUG_MAX_LEN || !SLUG_PATTERN.test(data.slug))
  ) {
    return { ok: false, code: "INVALID_INPUT", message: "slug must match /^[a-z0-9-]+$/" };
  }
  if (data.status !== undefined && !["draft", "published", "hidden"].includes(data.status)) {
    return { ok: false, code: "INVALID_INPUT", message: "status invalid" };
  }
  if (data.pageType !== undefined && !isOneOf(PAGE_TYPES, data.pageType)) {
    return { ok: false, code: "INVALID_INPUT", message: "pageType invalid" };
  }
  if (data.displayMode !== undefined && !isOneOf(PAGE_DISPLAY_MODES, data.displayMode)) {
    return { ok: false, code: "INVALID_INPUT", message: "displayMode invalid" };
  }
  if (data.overlayWidth !== undefined && !isOneOf(OVERLAY_WIDTHS, data.overlayWidth)) {
    return { ok: false, code: "INVALID_INPUT", message: "overlayWidth invalid" };
  }
  if (data.overlayHeight !== undefined && !isOneOf(OVERLAY_HEIGHTS, data.overlayHeight)) {
    return { ok: false, code: "INVALID_INPUT", message: "overlayHeight invalid" };
  }
  const repo = await getAdminRepository();
  if (data.slug !== undefined && data.slug !== slug) {
    if (await repo.contentPageSlugExists(data.slug)) {
      return { ok: false, code: "SLUG_TAKEN", message: "A page with this slug already exists" };
    }
  }
  // Detect segmented → default transition so we can clean up orphaned segments.
  let existing: ContentPageRow | null = null;
  if (data.pageType === "default") {
    existing = await repo.getContentPageBySlug(slug);
  }
  const row = await repo.updateContentPageMeta(slug, data);
  if (!row) return { ok: false, code: "NOT_FOUND", message: "Content page not found" };
  if (existing?.pageType === "segmented" && row.pageType === "default") {
    await repo.deleteSegmentsForOwner(row.slug);
  }
  const userIds = [row.createdBy, row.updatedBy].filter((id): id is string => id !== null);
  const usernames = await repo.getAdminUsernamesByIds(userIds);
  const segments = row.pageType === "segmented" ? (await repo.listSegmentsForOwner(row.slug)).map(segmentRowToDto) : [];
  return { ok: true, data: rowToPage(row, usernames, segments) };
}

export async function updateManagedContentPageBody(
  slug: string,
  content: string,
  updatedBy: string | null,
): Promise<ContentResult<ContentPage>> {
  if (typeof content !== "string" || content.length > CONTENT_MAX_LEN) {
    return { ok: false, code: "INVALID_INPUT", message: `content must be string (max ${CONTENT_MAX_LEN} chars)` };
  }
  const repo = await getAdminRepository();
  const row = await repo.updateContentPageBody(slug, content, updatedBy);
  if (!row) return { ok: false, code: "NOT_FOUND", message: "Content page not found" };
  const userIds = [row.createdBy, row.updatedBy].filter((id): id is string => id !== null);
  const usernames = await repo.getAdminUsernamesByIds(userIds);
  const segments = row.pageType === "segmented" ? (await repo.listSegmentsForOwner(row.slug)).map(segmentRowToDto) : [];
  return { ok: true, data: rowToPage(row, usernames, segments) };
}

export async function deleteManagedContentPage(slug: string): Promise<ContentResult<{ slug: string }>> {
  const repo = await getAdminRepository();
  const ok = await repo.deleteContentPage(slug);
  if (!ok) return { ok: false, code: "NOT_FOUND", message: "Content page not found" };
  return { ok: true, data: { slug } };
}

// -- Public reads -------------------------------------------------------------

export async function getPublicContentPages(): Promise<Array<{ slug: string; title: string }>> {
  const repo = await getAdminRepository();
  return repo.listPublishedContentPages();
}

export async function getPublicContentPage(slug: string): Promise<PublicContentPage | null> {
  const repo = await getAdminRepository();
  const row = await repo.getPublishedContentPageBySlug(slug);
  if (!row) return null;

  const base = {
    slug: row.slug,
    title: row.title,
    showTitle: row.showTitle,
    pageType: row.pageType,
    displayMode: row.displayMode,
    overlayWidth: row.overlayWidth,
    overlayHeight: row.overlayHeight,
    content: row.content,
    contentHtml: renderBody(row.content),
  };

  if (row.pageType !== "segmented") {
    return { ...base, segments: [] };
  }

  const segmentRows = await repo.listSegmentsForOwner(row.slug);
  if (segmentRows.length === 0) return { ...base, segments: [] };

  const targetSlugs = Array.from(new Set(segmentRows.map((s) => s.targetSlug)));
  const targets = await repo.getPublishedContentPagesBySlugs(targetSlugs);
  const bySlug = new Map(targets.map((t) => [t.slug, t]));

  const segments: PublicPageSegment[] = segmentRows
    .filter((s) => bySlug.has(s.targetSlug))
    .map((s) => {
      const t = bySlug.get(s.targetSlug)!;
      return {
        label: s.label,
        targetSlug: s.targetSlug,
        title: t.title,
        showTitle: t.showTitle,
        content: t.content,
        contentHtml: renderBody(t.content),
      };
    });

  return { ...base, segments };
}
