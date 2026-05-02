import type {
  ContentPage,
  ContentPageSummary,
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
  DEFAULT_LOCALE,
  isLocale,
  LOCALES,
  OVERLAY_WIDTHS,
  PAGE_DISPLAY_MODES,
  PAGE_TITLE_ALIGNMENTS,
  PAGE_TYPES,
} from "@musiccloud/shared";
import type { Tokens } from "marked";
import { marked } from "marked";
import markedFootnote from "marked-footnote";
import { markedHighlight } from "marked-highlight";
import { codeToHtml } from "shiki";

const KNOWN_CARD_MODIFIERS = new Set(["recessed", "embossed"] as const);
type CardModifier = "recessed" | "embossed";

function parseInfostring(raw: string): {
  lang: string | null;
  modifier: CardModifier | null;
  padding: string | null;
  radius: string | null;
} {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  let modifier: CardModifier | null = null;
  let lang: string | null = null;
  let padding: string | null = null;
  let radius: string | null = null;
  for (const t of tokens) {
    if (KNOWN_CARD_MODIFIERS.has(t as CardModifier)) modifier = t as CardModifier;
    else if (t.startsWith("padding=")) padding = t.slice("padding=".length);
    else if (t.startsWith("radius=")) radius = t.slice("radius=".length);
    else if (lang === null) lang = t;
  }
  return { lang, modifier, padding, radius };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlightPlainText(code: string): string {
  return code
    .split("\n")
    .map((line) => {
      const leading = line.match(/^\s*/)?.[0] ?? "";
      const rest = line.slice(leading.length);
      if (rest.startsWith("#") || rest.startsWith("//")) {
        return `${leading}<span style="color:#9A9AA0;font-style:italic">${escapeHtml(rest)}</span>`;
      }
      return escapeHtml(line);
    })
    .join("\n");
}

marked.use(markedFootnote(), { gfm: true });

marked.use(
  markedHighlight({
    async: true,
    async highlight(code, infostring) {
      // marked passes the FULL fence info-string as `lang` (e.g.
      // "text recessed padding=0.75rem"). We must parse out the real
      // language before deciding the highlight path; otherwise both
      // the `text` intercept and Shiki miss.
      const { lang } = parseInfostring(infostring ?? "");
      if (!lang) return escapeHtml(code);
      if (lang.toLowerCase() === "text") return highlightPlainText(code);
      try {
        const html = await codeToHtml(code, { lang, theme: "vitesse-dark" });
        // Shiki returns full <pre><code>...wrapper. Extract inner of <code>...</code>.
        const m = html.match(/<code[^>]*>([\s\S]*?)<\/code>/);
        return m ? m[1] : escapeHtml(code);
      } catch {
        // Unknown language: shiki throws; fall back to escaped plain text.
        return escapeHtml(code);
      }
    },
  }),
);

marked.use({
  renderer: {
    code({ text, lang: rawLang }: Tokens.Code): string {
      const parsed = parseInfostring(rawLang ?? "");
      // Default: every fenced code block is recessed-wrapped. Authors opt
      // into a different look with `embossed`, or override padding/radius via
      // padding=/radius= modifiers. There is no "no-card" code fence.
      const modifier = parsed.modifier ?? "recessed";
      const styleAttr = ` data-card-style="${modifier}"`;
      const paddingAttr = parsed.padding ? ` data-card-padding="${escapeHtml(parsed.padding)}"` : "";
      const radiusAttr = parsed.radius ? ` data-card-radius="${escapeHtml(parsed.radius)}"` : "";
      const langClass = parsed.lang ? ` class="language-${escapeHtml(parsed.lang)}"` : "";
      // `text` is already shiki-highlighted HTML or escaped fallback.
      return `<pre${styleAttr}${paddingAttr}${radiusAttr}><code${langClass}>${text}</code></pre>\n`;
    },
  },
});

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

async function renderBody(content: string): Promise<string> {
  return (await marked.parse(content, { async: true })) as string;
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
    slug: row.slug,
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
      translationReady: t.translationReady,
      isStale: statuses[t.locale as Locale] === "stale",
      sourceUpdatedAt: t.sourceUpdatedAt ? t.sourceUpdatedAt.toISOString() : null,
      updatedAt: t.updatedAt.toISOString(),
    }));
  return { ...rowToSummary(row, usernames, statuses), content: row.content, segments, translations };
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

export async function getManagedContentPage(slug: string): Promise<ContentResult<ContentPage>> {
  const repo = await getAdminRepository();
  const row = await repo.getContentPageBySlug(slug);
  if (!row) return { ok: false, code: "NOT_FOUND", message: "Content page not found" };
  const userIds = [row.createdBy, row.updatedBy].filter((id): id is string => id !== null);
  const [usernames, translationData, segments] = await Promise.all([
    repo.getAdminUsernamesByIds(userIds),
    getPageTranslationsWithStatus(slug),
    row.pageType === "segmented" ? loadSegmentsWithTranslations(repo, row.slug) : Promise.resolve([]),
  ]);
  if (!translationData) throw new Error(`invariant violated: translations missing for confirmed page: ${slug}`);
  const { statuses, translations: translationRows } = translationData;
  return { ok: true, data: rowToPage(row, usernames, segments, statuses, translationRows) };
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
  return { ok: true, data: rowToPage(row, usernames, [], emptyStatuses(), []) };
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
  if (data.titleAlignment !== undefined && !isOneOf(PAGE_TITLE_ALIGNMENTS, data.titleAlignment)) {
    return { ok: false, code: "INVALID_INPUT", message: "titleAlignment invalid" };
  }
  if (data.contentCardStyle !== undefined && !isOneOf(CONTENT_CARD_STYLES, data.contentCardStyle)) {
    return { ok: false, code: "INVALID_INPUT", message: "contentCardStyle invalid" };
  }
  const repo = await getAdminRepository();
  if (data.slug !== undefined && data.slug !== slug) {
    if (await repo.contentPageSlugExists(data.slug)) {
      return { ok: false, code: "SLUG_TAKEN", message: "A page with this slug already exists" };
    }
  }
  // Detect segmented → default transition so we can clean up orphaned segments.
  // Also fetch existing row to detect title changes that should bump content_updated_at.
  const needsExisting = data.pageType === "default" || data.title !== undefined;
  let existing: ContentPageRow | null = null;
  if (needsExisting) {
    existing = await repo.getContentPageBySlug(slug);
  }
  const row = await repo.updateContentPageMeta(slug, data);
  if (!row) return { ok: false, code: "NOT_FOUND", message: "Content page not found" };
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
  slug: string,
  content: string,
  updatedBy: string | null,
): Promise<ContentResult<ContentPage>> {
  if (typeof content !== "string" || content.length > CONTENT_MAX_LEN) {
    return { ok: false, code: "INVALID_INPUT", message: `content must be string (max ${CONTENT_MAX_LEN} chars)` };
  }
  const repo = await getAdminRepository();
  // Fetch existing row to detect actual content change before updating.
  const existing = await repo.getContentPageBySlug(slug);
  if (!existing) return { ok: false, code: "NOT_FOUND", message: "Content page not found" };
  const row = await repo.updateContentPageBody(slug, content, updatedBy);
  if (!row) return { ok: false, code: "NOT_FOUND", message: "Content page not found" };
  // Bump content_updated_at only when content actually changed.
  if (content !== existing.content) {
    await repo.setContentPageContentUpdatedAt(slug, new Date());
  }
  const userIds = [row.createdBy, row.updatedBy].filter((id): id is string => id !== null);
  const [usernames, translationData, segments] = await Promise.all([
    repo.getAdminUsernamesByIds(userIds),
    getPageTranslationsWithStatus(slug),
    row.pageType === "segmented" ? loadSegmentsWithTranslations(repo, row.slug) : Promise.resolve([]),
  ]);
  if (!translationData) throw new Error(`invariant violated: translations missing for confirmed page: ${slug}`);
  const { statuses, translations: translationRows } = translationData;
  return { ok: true, data: rowToPage(row, usernames, segments, statuses, translationRows) };
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

export async function getPublicContentPage(slug: string, locale: Locale): Promise<PublicContentPage | null> {
  const repo = await getAdminRepository();
  const row = await repo.getPublishedContentPageBySlug(slug);
  if (!row) return null;

  // Resolve title + content from translation when locale is non-default and translation is ready.
  let resolvedTitle = row.title;
  let resolvedContent = row.content;

  if (locale !== DEFAULT_LOCALE) {
    const translations = await repo.listPageTranslations(slug);
    const tx = translations.find((t) => t.locale === locale && t.translationReady);
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
      const tx = txRows.find((t) => t.locale === locale && t.translationReady);
      if (tx) targetTranslations.set(targetSlug, tx);
    }
  }

  const segments: PublicPageSegment[] = await Promise.all(
    segmentRows
      .filter((s) => bySlug.has(s.targetSlug))
      .map(async (s) => {
        const t = bySlug.get(s.targetSlug)!;
        const tx = targetTranslations.get(s.targetSlug);
        const resolvedSegLabel = segmentTranslationsBySegmentId.get(s.id) ?? s.label;
        const resolvedSegTitle = tx ? tx.title : t.title;
        const resolvedSegContent = tx ? tx.content : t.content;
        return {
          label: resolvedSegLabel,
          targetSlug: s.targetSlug,
          title: resolvedSegTitle,
          showTitle: t.showTitle,
          content: resolvedSegContent,
          contentHtml: await renderBody(resolvedSegContent),
        };
      }),
  );

  return { ...base, segments };
}
