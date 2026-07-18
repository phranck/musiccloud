import type {
  ContentContextMask,
  ContentPage,
  ContentPageSummary,
  ContentPublication,
  ContentStatus,
  Locale,
  PageSegment,
  PageTranslation,
  PageType,
  PublicContentPage,
  PublicPageSegment,
  TranslationStatus,
} from "@musiccloud/shared";
import {
  CONTENT_CARD_STYLES,
  ContentContext,
  DEFAULT_LOCALE,
  isLocale,
  isValidContentContextMask,
  LOCALES,
  OVERLAY_WIDTHS,
  PAGE_DISPLAY_MODES,
  PAGE_TITLE_ALIGNMENTS,
  PAGE_TYPES,
} from "@musiccloud/shared";
import type {
  AdminRepository,
  ContentPageMetaUpdate,
  ContentPageRow,
  ContentPageSummaryRow,
  ContentPageTranslationRow,
  PageSegmentRow,
} from "../db/admin-repository.js";
import { getAdminRepository } from "../db/index.js";
import { getPageTranslationsWithStatus } from "./admin-translations.js";
import { isReservedDeveloperPortalPath, normalizeEditorialPath } from "./editorial-path.js";
import { MARKDOWN_EXTENSION_REGISTRY, type MarkdownExtensionRegistry } from "./markdown/extension-registry.js";
import { renderMarkdown } from "./markdown/renderer.js";
import { validateMarkdownForContexts } from "./markdown/validation.js";

const SLUG_PATTERN = /^[a-z0-9-]+$/;
const SLUG_MAX_LEN = 100;
const TITLE_MAX_LEN = 200;
const CONTENT_MAX_LEN = 100_000;

export type ContentResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: "NOT_FOUND" | "SLUG_TAKEN" | "PATH_TAKEN" | "INVALID_INPUT"; message: string };

function isOneOf<T extends readonly string[]>(list: T, v: unknown): v is T[number] {
  return typeof v === "string" && (list as readonly string[]).includes(v);
}

function contentUniquenessCode(error: unknown): "SLUG_TAKEN" | "PATH_TAKEN" | null {
  if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "23505") return null;
  const constraint = "constraint" in error && typeof error.constraint === "string" ? error.constraint : "";
  return constraint === "content_pages_pkey" || constraint.includes("slug") ? "SLUG_TAKEN" : "PATH_TAKEN";
}

async function renderBody(content: string | null | undefined): Promise<string> {
  return renderMarkdown(content ?? "", ContentContext.Frontend);
}

function segmentRowToDto(row: PageSegmentRow): PageSegment {
  return { id: row.id, position: row.position, label: row.label, targetSlug: row.targetSlug };
}

async function loadSegmentsWithTranslations(repo: AdminRepository, ownerSlug: string): Promise<PageSegment[]> {
  const [rows, translationRows] = await Promise.all([
    repo.listSegmentsForOwner(ownerSlug),
    repo.listSegmentTranslationsForOwner(ownerSlug),
  ]);
  const translationsBySegmentId = new Map<number, Partial<Record<Locale, string>>>();
  for (const t of translationRows) {
    if (!isLocale(t.locale) || t.locale === DEFAULT_LOCALE) continue;
    let map = translationsBySegmentId.get(t.segmentId);
    if (!map) {
      map = {};
      translationsBySegmentId.set(t.segmentId, map);
    }
    map[t.locale] = t.label;
  }
  return rows.map((r) => {
    const dto = segmentRowToDto(r);
    const tx = translationsBySegmentId.get(r.id);
    return tx ? { ...dto, translations: tx } : dto;
  });
}

function rowToSummary(
  row: ContentPageSummaryRow,
  usernames: Map<string, string>,
  statuses: Record<Locale, TranslationStatus>,
): ContentPageSummary {
  return {
    id: row.id ?? row.slug,
    slug: row.slug,
    contextMask: row.contextMask ?? ContentContext.Frontend,
    publications: pagePublications(row),
    title: row.title,
    status: row.status,
    showTitle: row.showTitle,
    titleAlignment: row.titleAlignment,
    pageType: row.pageType,
    displayMode: row.displayMode,
    overlayWidth: row.overlayWidth,
    contentCardStyle: row.contentCardStyle,
    createdByUsername: row.createdBy ? (usernames.get(row.createdBy) ?? null) : null,
    updatedByUsername: row.updatedBy ? (usernames.get(row.updatedBy) ?? null) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
    translationStatus: statuses,
    ...(row.segments !== undefined && { segments: row.segments }),
  };
}

function legacyFrontendPublication(slug: string, status: ContentStatus): ContentPublication[] {
  return [
    {
      context: ContentContext.Frontend,
      path: normalizeEditorialPath(slug),
      status,
      templateKey: "frontend-default",
    },
  ];
}

function pagePublications(page: Pick<ContentPageSummaryRow, "slug" | "status" | "publications">): ContentPublication[] {
  return page.publications && page.publications.length > 0
    ? page.publications.map(({ pageId: _pageId, ...publication }) => publication)
    : legacyFrontendPublication(page.slug, page.status);
}

export function normalizeAndValidateContentPublications(
  contextMask: ContentContextMask,
  publications: ContentPublication[],
  content: string,
  registry: MarkdownExtensionRegistry = MARKDOWN_EXTENSION_REGISTRY,
): ContentPublication[] | string {
  if (!isValidContentContextMask(contextMask)) return "contextMask must enable Frontend, Developer Portal, or both";
  if (!Array.isArray(publications) || publications.length === 0) return "at least one publication is required";

  const seenContexts = new Set<number>();
  let publicationMask = 0;
  const normalized: ContentPublication[] = [];
  for (const publication of publications) {
    if (publication.context !== ContentContext.Frontend && publication.context !== ContentContext.DeveloperPortal) {
      return "publication context must be a single known context";
    }
    if (seenContexts.has(publication.context)) return "each context may have only one publication";
    if (!publication.templateKey?.trim()) return "publication templateKey is required";
    if (!(["draft", "published", "hidden"] as const).includes(publication.status)) {
      return "publication status invalid";
    }

    let path: string;
    try {
      path = normalizeEditorialPath(publication.path);
    } catch (error) {
      return error instanceof Error ? error.message : "publication path invalid";
    }
    if (publication.context === ContentContext.DeveloperPortal && isReservedDeveloperPortalPath(path)) {
      return `Developer Portal path '${path}' is reserved`;
    }

    seenContexts.add(publication.context);
    publicationMask |= publication.context;
    normalized.push({ ...publication, path, templateKey: publication.templateKey.trim() });
  }

  if (publicationMask !== contextMask) return "publications must exactly match the enabled contextMask";
  if (normalized.some((publication) => publication.status === "published")) {
    const validation = validateMarkdownForContexts(content, contextMask, registry);
    if (!validation.ok) {
      const extensions = validation.errors.map((error) => error.extension).join(", ");
      return `Markdown extensions unavailable in an enabled context: ${extensions}`;
    }
  }
  return normalized.sort((a, b) => a.context - b.context);
}

async function getContentPageByIdentity(repo: AdminRepository, identity: string): Promise<ContentPageRow | null> {
  return (await repo.getContentPageById(identity)) ?? repo.getContentPageBySlug(identity);
}

function rowToPage(
  row: ContentPageRow,
  usernames: Map<string, string>,
  segments: PageSegment[],
  statuses: Record<Locale, TranslationStatus>,
  translationRows: ContentPageTranslationRow[],
): ContentPage {
  const translations: PageTranslation[] = translationRows
    .filter((t) => t.locale !== DEFAULT_LOCALE)
    .map((t) => ({
      locale: t.locale as Locale,
      title: t.title,
      content: t.content,
      isStale: statuses[t.locale as Locale] === "stale",
      sourceUpdatedAt: t.sourceUpdatedAt ? t.sourceUpdatedAt.toISOString() : null,
      updatedAt: t.updatedAt.toISOString(),
    }));
  const contextMask = row.contextMask ?? ContentContext.Frontend;
  return {
    ...rowToSummary(row, usernames, statuses),
    content: row.content,
    segments,
    translations,
    markdownValidation: validateMarkdownForContexts(row.content, contextMask),
  };
}

function emptyStatuses(): Record<Locale, TranslationStatus> {
  return Object.fromEntries(LOCALES.map((l) => [l, l === DEFAULT_LOCALE ? "ready" : "missing"])) as Record<
    Locale,
    TranslationStatus
  >;
}

export async function getManagedContentPages(): Promise<ContentPageSummary[]> {
  const repo = await getAdminRepository();
  const rows = await repo.listContentPageSummaries();
  const userIds = rows.flatMap((r) => [r.createdBy, r.updatedBy]).filter((id): id is string => id !== null);
  const [usernames, translationResults] = await Promise.all([
    repo.getAdminUsernamesByIds(userIds),
    Promise.all(rows.map((r) => getPageTranslationsWithStatus(r.slug))),
  ]);
  return rows.map((row, i) => rowToSummary(row, usernames, translationResults[i]?.statuses ?? emptyStatuses()));
}

export async function getManagedContentPage(identity: string): Promise<ContentResult<ContentPage>> {
  const repo = await getAdminRepository();
  const row = await getContentPageByIdentity(repo, identity);
  if (!row) return { ok: false, code: "NOT_FOUND", message: "Content page not found" };
  const userIds = [row.createdBy, row.updatedBy].filter((id): id is string => id !== null);
  const [usernames, translationData, segments] = await Promise.all([
    repo.getAdminUsernamesByIds(userIds),
    getPageTranslationsWithStatus(row.slug),
    row.pageType === "segmented" ? loadSegmentsWithTranslations(repo, row.slug) : Promise.resolve([]),
  ]);
  if (!translationData) throw new Error(`invariant violated: translations missing for confirmed page: ${row.slug}`);
  const { statuses, translations: translationRows } = translationData;
  return { ok: true, data: rowToPage(row, usernames, segments, statuses, translationRows) };
}

export async function createManagedContentPage(data: {
  slug: string;
  title: string;
  contextMask?: ContentContextMask;
  publications?: ContentPublication[];
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
  const contextMask = data.contextMask ?? ContentContext.Frontend;
  const publications = normalizeAndValidateContentPublications(
    contextMask,
    data.publications ?? legacyFrontendPublication(data.slug, data.status ?? "draft"),
    "",
  );
  if (typeof publications === "string") return { ok: false, code: "INVALID_INPUT", message: publications };
  const repo = await getAdminRepository();
  if (await repo.contentPageSlugExists(data.slug)) {
    return { ok: false, code: "SLUG_TAKEN", message: "A page with this slug already exists" };
  }
  let row: ContentPageRow;
  try {
    row = await repo.createContentPage({ ...data, contextMask, publications });
  } catch (error) {
    const code = contentUniquenessCode(error);
    if (code) {
      return {
        ok: false,
        code,
        message: code === "SLUG_TAKEN" ? "A page with this slug already exists" : "A context path is already in use",
      };
    }
    throw error;
  }
  const usernames = data.createdBy ? await repo.getAdminUsernamesByIds([data.createdBy]) : new Map();
  return { ok: true, data: rowToPage(row, usernames, [], emptyStatuses(), []) };
}

export async function updateManagedContentPageMeta(
  identity: string,
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
  if (data.titleAlignment !== undefined && !isOneOf(PAGE_TITLE_ALIGNMENTS, data.titleAlignment)) {
    return { ok: false, code: "INVALID_INPUT", message: "titleAlignment invalid" };
  }
  if (data.contentCardStyle !== undefined && !isOneOf(CONTENT_CARD_STYLES, data.contentCardStyle)) {
    return { ok: false, code: "INVALID_INPUT", message: "contentCardStyle invalid" };
  }
  const repo = await getAdminRepository();
  const existing = await getContentPageByIdentity(repo, identity);
  if (!existing) return { ok: false, code: "NOT_FOUND", message: "Content page not found" };
  if (data.slug !== undefined && data.slug !== existing.slug) {
    if (await repo.contentPageSlugExists(data.slug)) {
      return { ok: false, code: "SLUG_TAKEN", message: "A page with this slug already exists" };
    }
  }
  const renamesLegacyPath = data.slug !== undefined && data.slug !== existing.slug;
  const contextualUpdate =
    data.contextMask !== undefined || data.publications !== undefined || data.status !== undefined || renamesLegacyPath;
  let normalizedPublications: ContentPublication[] | undefined;
  const contextMask = data.contextMask ?? existing.contextMask ?? ContentContext.Frontend;
  if (contextualUpdate) {
    const validation = normalizeAndValidateContentPublications(
      contextMask,
      data.publications ??
        pagePublications(existing).map((publication) => {
          const renamed =
            renamesLegacyPath && publication.path === normalizeEditorialPath(existing.slug)
              ? { ...publication, path: normalizeEditorialPath(data.slug!) }
              : publication;
          return data.status !== undefined && renamed.context === ContentContext.Frontend
            ? { ...renamed, status: data.status }
            : renamed;
        }),
      existing.content,
    );
    if (typeof validation === "string") return { ok: false, code: "INVALID_INPUT", message: validation };
    normalizedPublications = validation;
  }
  // Detect segmented → default transition so we can clean up orphaned segments.
  // Also fetch existing row to detect title changes that should bump content_updated_at.
  let row: ContentPageRow;
  try {
    const updated = await repo.updateContentPageMeta(existing.slug, {
      ...data,
      ...(contextualUpdate ? { contextMask, publications: normalizedPublications } : {}),
    });
    if (!updated) return { ok: false, code: "NOT_FOUND", message: "Content page not found" };
    row = updated;
    if (normalizedPublications) {
      const pageId = row.id ?? existing.id ?? row.slug;
      const persisted = row.publications?.every((publication) => "pageId" in publication)
        ? row.publications
        : await repo.replaceContentPublications(pageId, normalizedPublications);
      row.id = pageId;
      row.contextMask = contextMask;
      row.publications = persisted;
    }
  } catch (error) {
    const code = contentUniquenessCode(error);
    if (code) {
      return {
        ok: false,
        code,
        message:
          code === "SLUG_TAKEN"
            ? "A page with this slug already exists"
            : "A page already publishes at this context path",
      };
    }
    throw error;
  }
  if (existing?.pageType === "segmented" && row.pageType === "default") {
    await repo.deleteSegmentsForOwner(row.slug);
  }
  // Bump content_updated_at when title changes (title is part of translatable content).
  if (data.title !== undefined && existing && data.title !== existing.title) {
    await repo.setContentPageContentUpdatedAt(row.slug, new Date());
  }
  const effectiveSlug = row.slug;
  const userIds = [row.createdBy, row.updatedBy].filter((id): id is string => id !== null);
  const [usernames, translationData, segments] = await Promise.all([
    repo.getAdminUsernamesByIds(userIds),
    getPageTranslationsWithStatus(effectiveSlug),
    row.pageType === "segmented" ? loadSegmentsWithTranslations(repo, effectiveSlug) : Promise.resolve([]),
  ]);
  if (!translationData)
    throw new Error(`invariant violated: translations missing for confirmed page: ${effectiveSlug}`);
  const { statuses, translations: translationRows } = translationData;
  return { ok: true, data: rowToPage(row, usernames, segments, statuses, translationRows) };
}

export async function updateManagedContentPageBody(
  identity: string,
  content: string,
  updatedBy: string | null,
): Promise<ContentResult<ContentPage>> {
  if (typeof content !== "string" || content.length > CONTENT_MAX_LEN) {
    return { ok: false, code: "INVALID_INPUT", message: `content must be string (max ${CONTENT_MAX_LEN} chars)` };
  }
  const repo = await getAdminRepository();
  // Fetch existing row to detect actual content change before updating.
  const existing = await getContentPageByIdentity(repo, identity);
  if (!existing) return { ok: false, code: "NOT_FOUND", message: "Content page not found" };
  const publications = pagePublications(existing);
  if (publications.some((publication) => publication.status === "published")) {
    const validation = validateMarkdownForContexts(content, existing.contextMask ?? ContentContext.Frontend);
    if (!validation.ok) {
      return {
        ok: false,
        code: "INVALID_INPUT",
        message: `Markdown extensions unavailable in an enabled context: ${validation.errors
          .map((error) => error.extension)
          .join(", ")}`,
      };
    }
  }
  const row = await repo.updateContentPageBody(existing.slug, content, updatedBy);
  if (!row) return { ok: false, code: "NOT_FOUND", message: "Content page not found" };
  // Bump content_updated_at only when content actually changed.
  if (content !== existing.content) {
    await repo.setContentPageContentUpdatedAt(existing.slug, new Date());
  }
  const userIds = [row.createdBy, row.updatedBy].filter((id): id is string => id !== null);
  const [usernames, translationData, segments] = await Promise.all([
    repo.getAdminUsernamesByIds(userIds),
    getPageTranslationsWithStatus(existing.slug),
    row.pageType === "segmented" ? loadSegmentsWithTranslations(repo, row.slug) : Promise.resolve([]),
  ]);
  if (!translationData)
    throw new Error(`invariant violated: translations missing for confirmed page: ${existing.slug}`);
  const { statuses, translations: translationRows } = translationData;
  return { ok: true, data: rowToPage(row, usernames, segments, statuses, translationRows) };
}

export async function deleteManagedContentPage(identity: string): Promise<ContentResult<{ slug: string }>> {
  const repo = await getAdminRepository();
  const existing = await getContentPageByIdentity(repo, identity);
  if (!existing) return { ok: false, code: "NOT_FOUND", message: "Content page not found" };
  const ok = await repo.deleteContentPage(existing.slug);
  if (!ok) return { ok: false, code: "NOT_FOUND", message: "Content page not found" };
  return { ok: true, data: { slug: existing.slug } };
}

// -- Public reads -------------------------------------------------------------

export async function getPublicContentPages(): Promise<Array<{ slug: string; title: string }>> {
  const repo = await getAdminRepository();
  return repo.listPublishedContentPages();
}

export async function getPublicContentPage(slug: string, locale: Locale): Promise<PublicContentPage | null> {
  const repo = await getAdminRepository();
  const path = normalizeEditorialPath(slug);
  const legacySlug = path.slice(1);
  const row =
    (await repo.getPublishedContentPageByPath?.(ContentContext.Frontend, path)) ??
    (await repo.getPublishedContentPageBySlug(legacySlug));
  if (!row) return null;

  // Resolve title + content from translation when locale is non-default and a translation row exists.
  let resolvedTitle = row.title;
  let resolvedContent = row.content;

  if (locale !== DEFAULT_LOCALE) {
    const translations = await repo.listPageTranslations(row.slug);
    const tx = translations.find((t) => t.locale === locale);
    if (tx) {
      resolvedTitle = tx.title;
      resolvedContent = tx.content;
    }
  }

  const base = {
    slug: row.slug,
    title: resolvedTitle,
    showTitle: row.showTitle,
    titleAlignment: row.titleAlignment,
    pageType: row.pageType,
    displayMode: row.displayMode,
    overlayWidth: row.overlayWidth,
    contentCardStyle: row.contentCardStyle,
    content: resolvedContent,
    contentHtml: await renderBody(resolvedContent),
  };

  if (row.pageType !== "segmented") {
    return { ...base, segments: [] };
  }

  const segmentRows = await repo.listSegmentsForOwner(row.slug);
  if (segmentRows.length === 0) return { ...base, segments: [] };

  // Resolve per-segment labels from translations when locale is non-default.
  const segmentTranslationsBySegmentId = new Map<number, string>();
  if (locale !== DEFAULT_LOCALE) {
    const segTxRows = await repo.listSegmentTranslationsForOwner(row.slug);
    for (const t of segTxRows) {
      if (t.locale === locale) {
        segmentTranslationsBySegmentId.set(t.segmentId, t.label);
      }
    }
  }

  const targetSlugs = Array.from(new Set(segmentRows.map((s) => s.targetSlug)));
  const targets = await repo.getPublishedContentPagesBySlugs(targetSlugs);
  const bySlug = new Map(targets.map((t) => [t.slug, t]));

  // Load target-page translations for non-default locale.
  const targetTranslations = new Map<string, ContentPageTranslationRow>();
  if (locale !== DEFAULT_LOCALE) {
    for (const targetSlug of targetSlugs) {
      const txRows = await repo.listPageTranslations(targetSlug);
      const tx = txRows.find((t) => t.locale === locale);
      if (tx) targetTranslations.set(targetSlug, tx);
    }
  }

  // Render segments SEQUENTIALLY, not in parallel. Each concrete context
  // owns one cached Marked instance, and parallel parses on that same
  // instance can corrupt the tokenizer's shared state and throw
  // "Cannot read properties of undefined (reading 'filter')". Reproducer
  // and root-cause analysis lived in marked-isolate.test.ts.
  const segments: PublicPageSegment[] = [];
  for (const s of segmentRows) {
    if (!bySlug.has(s.targetSlug)) continue;
    const t = bySlug.get(s.targetSlug)!;
    const tx = targetTranslations.get(s.targetSlug);
    const resolvedSegLabel = segmentTranslationsBySegmentId.get(s.id) ?? s.label;
    const resolvedSegTitle = tx ? tx.title : t.title;
    const resolvedSegContent = tx ? tx.content : t.content;
    segments.push({
      label: resolvedSegLabel,
      targetSlug: s.targetSlug,
      title: resolvedSegTitle,
      showTitle: t.showTitle,
      content: resolvedSegContent,
      contentHtml: await renderBody(resolvedSegContent),
    });
  }

  return { ...base, segments };
}
