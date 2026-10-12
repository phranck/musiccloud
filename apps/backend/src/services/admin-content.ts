import type {
  ContentContextMask,
  ContentPage,
  ContentPageSummary,
  ContentPublication,
  ContentStatus,
  PageSegment,
  PageType,
  PublicContentPage,
  PublicPageSegment,
} from "@musiccloud/shared";
import {
  CONTENT_BODY_MAX_LENGTH,
  CONTENT_CARD_STYLES,
  CONTENT_SLUG_MAX_LENGTH,
  CONTENT_SLUG_PATTERN,
  CONTENT_TITLE_MAX_LENGTH,
  ContentContext,
  isPortalReservedPath,
  isValidContentContextMask,
  normalizeEditorialPath,
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
  NavigationConfigurationEntryRow,
  PageSegmentRow,
} from "../db/admin-repository.js";
import { getAdminRepository } from "../db/index.js";
import { renderEditorialBody } from "./editorial-body.js";
import { MARKDOWN_EXTENSION_REGISTRY, type MarkdownExtensionRegistry } from "./markdown/extension-registry.js";
import { validateMarkdownForContexts } from "./markdown/validation.js";

export type ContentResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: "NOT_FOUND" | "SLUG_TAKEN" | "PATH_TAKEN" | "INVALID_INPUT"; message: string };

const CONTENT_STATUSES = ["draft", "published", "hidden"] as const;

function isOneOf<T extends readonly string[]>(list: T, v: unknown): v is T[number] {
  return typeof v === "string" && (list as readonly string[]).includes(v);
}

/** The message for a field that has to be one of a fixed set of values. */
function oneOfMessage(field: string, values: readonly string[]): string {
  return `${field} must be one of ${values.join(", ")}`;
}

/**
 * Checks the meta fields of a page create, edit or bulk save, so all three
 * refuse the same values with the same message. A field that is absent is not
 * checked.
 *
 * The enum columns are plain text in the database, so this is the only place a
 * value outside its set is stopped before the site reads it back.
 *
 * @param meta - The fields to check, as the caller received them.
 * @param currentSlug - The page's slug before the change. A slug equal to it
 *   is not checked again, so a page whose slug predates the current rule can
 *   still be saved without renaming it.
 * @returns A message naming the first refused field, or `null` when every
 *   field is acceptable.
 */
export function validateContentPageMeta(meta: Record<string, unknown>, currentSlug?: string): string | null {
  const { title, slug, status, pageType, displayMode, overlayWidth, titleAlignment, contentCardStyle, showTitle } =
    meta;
  if (
    title !== undefined &&
    (typeof title !== "string" || title.length === 0 || title.length > CONTENT_TITLE_MAX_LENGTH)
  ) {
    return `title must be non-empty (max ${CONTENT_TITLE_MAX_LENGTH} chars)`;
  }
  if (
    slug !== undefined &&
    slug !== currentSlug &&
    (typeof slug !== "string" || slug.length > CONTENT_SLUG_MAX_LENGTH || !CONTENT_SLUG_PATTERN.test(slug))
  ) {
    return `slug must be lowercase letters, digits and inner hyphens (max ${CONTENT_SLUG_MAX_LENGTH} chars)`;
  }
  if (status !== undefined && !isOneOf(CONTENT_STATUSES, status)) return oneOfMessage("status", CONTENT_STATUSES);
  if (pageType !== undefined && !isOneOf(PAGE_TYPES, pageType)) return oneOfMessage("pageType", PAGE_TYPES);
  if (displayMode !== undefined && !isOneOf(PAGE_DISPLAY_MODES, displayMode)) {
    return oneOfMessage("displayMode", PAGE_DISPLAY_MODES);
  }
  if (overlayWidth !== undefined && !isOneOf(OVERLAY_WIDTHS, overlayWidth)) {
    return oneOfMessage("overlayWidth", OVERLAY_WIDTHS);
  }
  if (titleAlignment !== undefined && !isOneOf(PAGE_TITLE_ALIGNMENTS, titleAlignment)) {
    return oneOfMessage("titleAlignment", PAGE_TITLE_ALIGNMENTS);
  }
  if (contentCardStyle !== undefined && !isOneOf(CONTENT_CARD_STYLES, contentCardStyle)) {
    return oneOfMessage("contentCardStyle", CONTENT_CARD_STYLES);
  }
  if (showTitle !== undefined && typeof showTitle !== "boolean") return "showTitle must be boolean";
  return null;
}

/**
 * Checks a page's Markdown body for a single save and for a bulk save alike.
 *
 * @param content - The body as the caller received it.
 * @returns A message when the body is refused, or `null`.
 */
export function validateContentPageBody(content: unknown): string | null {
  return typeof content !== "string" || content.length > CONTENT_BODY_MAX_LENGTH
    ? `content must be a string (max ${CONTENT_BODY_MAX_LENGTH} chars)`
    : null;
}

function contentUniquenessCode(error: unknown): "SLUG_TAKEN" | "PATH_TAKEN" | null {
  if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "23505") return null;
  const constraint = "constraint" in error && typeof error.constraint === "string" ? error.constraint : "";
  return constraint === "content_pages_pkey" || constraint.includes("slug") ? "SLUG_TAKEN" : "PATH_TAKEN";
}

function segmentRowToDto(row: PageSegmentRow): PageSegment {
  return { id: row.id, position: row.position, label: row.label, targetSlug: row.targetSlug };
}

async function loadSegments(repo: AdminRepository, ownerSlug: string): Promise<PageSegment[]> {
  return (await repo.listSegmentsForOwner(ownerSlug)).map(segmentRowToDto);
}

function rowToSummary(row: ContentPageSummaryRow, usernames: Map<string, string>): ContentPageSummary {
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

export function contentContextRemovalNavigationError(
  entries: ReadonlyArray<Pick<NavigationConfigurationEntryRow, "pageId" | "contextMask">>,
  pageId: string,
  currentContextMask: ContentContextMask,
  nextContextMask: ContentContextMask,
): string | null {
  const removedContextMask = currentContextMask & ~nextContextMask;
  if (removedContextMask === 0) return null;
  const dependency = entries.find((entry) => entry.pageId === pageId && (entry.contextMask & removedContextMask) !== 0);
  if (!dependency) return null;
  const contextLabel =
    (dependency.contextMask & ContentContext.DeveloperPortal & removedContextMask) !== 0
      ? "Developer Portal"
      : "Frontend";
  return `Remove this page from ${contextLabel} navigation before disabling that context`;
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
    if (publication.context === ContentContext.DeveloperPortal && isPortalReservedPath(path)) {
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

function rowToPage(row: ContentPageRow, usernames: Map<string, string>, segments: PageSegment[]): ContentPage {
  const contextMask = row.contextMask ?? ContentContext.Frontend;
  return {
    ...rowToSummary(row, usernames),
    content: row.content,
    segments,
    markdownValidation: validateMarkdownForContexts(row.content, contextMask),
  };
}

export async function getManagedContentPages(): Promise<ContentPageSummary[]> {
  const repo = await getAdminRepository();
  const rows = await repo.listContentPageSummaries();
  const userIds = rows.flatMap((r) => [r.createdBy, r.updatedBy]).filter((id): id is string => id !== null);
  const usernames = await repo.getAdminUsernamesByIds(userIds);
  return rows.map((row) => rowToSummary(row, usernames));
}

export async function getManagedContentPage(identity: string): Promise<ContentResult<ContentPage>> {
  const repo = await getAdminRepository();
  const row = await getContentPageByIdentity(repo, identity);
  if (!row) return { ok: false, code: "NOT_FOUND", message: "Content page not found" };
  const userIds = [row.createdBy, row.updatedBy].filter((id): id is string => id !== null);
  const [usernames, segments] = await Promise.all([
    repo.getAdminUsernamesByIds(userIds),
    row.pageType === "segmented" ? loadSegments(repo, row.slug) : Promise.resolve([]),
  ]);
  return { ok: true, data: rowToPage(row, usernames, segments) };
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
  const invalid = validateContentPageMeta({
    title: data.title,
    slug: data.slug,
    status: data.status,
    pageType: data.pageType,
  });
  if (invalid) return { ok: false, code: "INVALID_INPUT", message: invalid };
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
  return { ok: true, data: rowToPage(row, usernames, []) };
}

export async function updateManagedContentPageMeta(
  identity: string,
  data: ContentPageMetaUpdate,
): Promise<ContentResult<ContentPage>> {
  const repo = await getAdminRepository();
  const existing = await getContentPageByIdentity(repo, identity);
  if (!existing) return { ok: false, code: "NOT_FOUND", message: "Content page not found" };
  const invalid = validateContentPageMeta({ ...data }, existing.slug);
  if (invalid) return { ok: false, code: "INVALID_INPUT", message: invalid };
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
  const currentContextMask = existing.contextMask ?? ContentContext.Frontend;
  if (existing.id && (currentContextMask & ~contextMask) !== 0) {
    const navigationError = contentContextRemovalNavigationError(
      await repo.listNavigationConfiguration(),
      existing.id,
      currentContextMask,
      contextMask,
    );
    if (navigationError) return { ok: false, code: "INVALID_INPUT", message: navigationError };
  }
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
  // Bump content_updated_at when the canonical title changes.
  if (data.title !== undefined && existing && data.title !== existing.title) {
    await repo.setContentPageContentUpdatedAt(row.slug, new Date());
  }
  const effectiveSlug = row.slug;
  const userIds = [row.createdBy, row.updatedBy].filter((id): id is string => id !== null);
  const [usernames, segments] = await Promise.all([
    repo.getAdminUsernamesByIds(userIds),
    row.pageType === "segmented" ? loadSegments(repo, effectiveSlug) : Promise.resolve([]),
  ]);
  return { ok: true, data: rowToPage(row, usernames, segments) };
}

export async function updateManagedContentPageBody(
  identity: string,
  content: string,
  updatedBy: string | null,
): Promise<ContentResult<ContentPage>> {
  const invalidBody = validateContentPageBody(content);
  if (invalidBody) return { ok: false, code: "INVALID_INPUT", message: invalidBody };
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
  const [usernames, segments] = await Promise.all([
    repo.getAdminUsernamesByIds(userIds),
    row.pageType === "segmented" ? loadSegments(repo, row.slug) : Promise.resolve([]),
  ]);
  return { ok: true, data: rowToPage(row, usernames, segments) };
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

function isPublishedForLegacyFrontendSlug(row: ContentPageRow): boolean {
  const publications = row.publications ?? [];
  if (publications.length === 0) return row.status === "published";
  return publications.some(
    (publication) => publication.context === ContentContext.Frontend && publication.status === "published",
  );
}

export async function getPublicContentPage(slug: string): Promise<PublicContentPage | null> {
  const repo = await getAdminRepository();
  const path = normalizeEditorialPath(slug);
  const legacySlug = path.slice(1);
  let row = await repo.getPublishedContentPageByPath(ContentContext.Frontend, path);
  if (!row) {
    const legacyCandidate = await repo.getContentPageBySlug(legacySlug);
    row = legacyCandidate && isPublishedForLegacyFrontendSlug(legacyCandidate) ? legacyCandidate : null;
  }
  if (!row) return null;

  const base = {
    slug: row.slug,
    title: row.title,
    showTitle: row.showTitle,
    titleAlignment: row.titleAlignment,
    pageType: row.pageType,
    displayMode: row.displayMode,
    overlayWidth: row.overlayWidth,
    contentCardStyle: row.contentCardStyle,
    content: row.content,
    contentHtml: await renderEditorialBody(row.content, ContentContext.Frontend),
  };

  if (row.pageType !== "segmented") {
    return { ...base, segments: [] };
  }

  const segmentRows = await repo.listSegmentsForOwner(row.slug);
  if (segmentRows.length === 0) return { ...base, segments: [] };

  const targetSlugs = Array.from(new Set(segmentRows.map((s) => s.targetSlug)));
  const targets = await repo.getPublishedContentPagesBySlugs(targetSlugs);
  const bySlug = new Map(targets.map((t) => [t.slug, t]));

  // Render segments SEQUENTIALLY, not in parallel. Each concrete context
  // owns one cached Marked instance, and parallel parses on that same
  // instance can corrupt the tokenizer's shared state and throw
  // "Cannot read properties of undefined (reading 'filter')". Reproducer
  // and root-cause analysis lived in marked-isolate.test.ts.
  const segments: PublicPageSegment[] = [];
  for (const s of segmentRows) {
    if (!bySlug.has(s.targetSlug)) continue;
    const t = bySlug.get(s.targetSlug)!;
    segments.push({
      label: s.label,
      targetSlug: s.targetSlug,
      title: t.title,
      showTitle: t.showTitle,
      content: t.content,
      contentHtml: await renderEditorialBody(t.content, ContentContext.Frontend),
    });
  }

  return { ...base, segments };
}
