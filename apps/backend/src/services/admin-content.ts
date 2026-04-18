import type { ContentPage, ContentPageSummary, ContentStatus, PublicContentPage } from "@musiccloud/shared";
import { marked } from "marked";

import type { ContentPageMetaUpdate, ContentPageRow, ContentPageSummaryRow } from "../db/admin-repository.js";
import { getAdminRepository } from "../db/index.js";

const SLUG_PATTERN = /^[a-z0-9-]+$/;
const SLUG_MAX_LEN = 100;
const TITLE_MAX_LEN = 200;
const CONTENT_MAX_LEN = 100_000;

export type ContentResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: "NOT_FOUND" | "SLUG_TAKEN" | "INVALID_INPUT"; message: string };

function rowToSummary(row: ContentPageSummaryRow, usernames: Map<string, string>): ContentPageSummary {
  return {
    slug: row.slug,
    title: row.title,
    status: row.status,
    showTitle: row.showTitle,
    createdBy: row.createdBy ? (usernames.get(row.createdBy) ?? null) : null,
    updatedBy: row.updatedBy ? (usernames.get(row.updatedBy) ?? null) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
  };
}

function rowToPage(row: ContentPageRow, usernames: Map<string, string>): ContentPage {
  return { ...rowToSummary(row, usernames), content: row.content };
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
  return { ok: true, data: rowToPage(row, usernames) };
}

export async function createManagedContentPage(data: {
  slug: string;
  title: string;
  status?: ContentStatus;
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
  const repo = await getAdminRepository();
  if (await repo.contentPageSlugExists(data.slug)) {
    return { ok: false, code: "SLUG_TAKEN", message: "A page with this slug already exists" };
  }
  const row = await repo.createContentPage(data);
  const usernames = data.createdBy ? await repo.getAdminUsernamesByIds([data.createdBy]) : new Map();
  return { ok: true, data: rowToPage(row, usernames) };
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
  const repo = await getAdminRepository();
  if (data.slug !== undefined && data.slug !== slug) {
    if (await repo.contentPageSlugExists(data.slug)) {
      return { ok: false, code: "SLUG_TAKEN", message: "A page with this slug already exists" };
    }
  }
  const row = await repo.updateContentPageMeta(slug, data);
  if (!row) return { ok: false, code: "NOT_FOUND", message: "Content page not found" };
  const userIds = [row.createdBy, row.updatedBy].filter((id): id is string => id !== null);
  const usernames = await repo.getAdminUsernamesByIds(userIds);
  return { ok: true, data: rowToPage(row, usernames) };
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
  return { ok: true, data: rowToPage(row, usernames) };
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
  return {
    slug: row.slug,
    title: row.title,
    showTitle: row.showTitle,
    content: row.content,
    contentHtml: marked.parse(row.content, { async: false }) as string,
  };
}
