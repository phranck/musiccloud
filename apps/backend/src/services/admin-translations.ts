import type { Locale, TranslationStatus } from "@musiccloud/shared";
import { DEFAULT_LOCALE, LOCALES, isLocale } from "@musiccloud/shared";
import type {
  ContentPageRow,
  ContentPageTranslationRow,
} from "../db/admin-repository.js";
import { getAdminRepository } from "../db/index.js";

export type TranslationResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: "NOT_FOUND" | "INVALID_INPUT"; message: string };

export interface PageTranslationsWithStatus {
  translations: ContentPageTranslationRow[];
  statuses: Record<Locale, TranslationStatus>;
  page: ContentPageRow;
}

const TITLE_MAX_LEN = 200;
const CONTENT_MAX_LEN = 100_000;

function computeStatus(
  page: ContentPageRow,
  translation: ContentPageTranslationRow | undefined,
  locale: Locale,
): TranslationStatus {
  if (locale === DEFAULT_LOCALE) return "ready";
  if (!translation) return "missing";
  if (!translation.translationReady) return "draft";
  const src = translation.sourceUpdatedAt?.getTime() ?? 0;
  if (page.contentUpdatedAt.getTime() > src) return "stale";
  return "ready";
}

export async function getPageTranslationsWithStatus(
  slug: string,
): Promise<PageTranslationsWithStatus | null> {
  const repo = await getAdminRepository();
  const page = await repo.getContentPageBySlug(slug);
  if (!page) return null;
  const translations = await repo.listPageTranslations(slug);
  const byLocale = new Map(translations.map((t) => [t.locale, t]));
  const statuses = Object.fromEntries(
    LOCALES.map((l) => [l, computeStatus(page, byLocale.get(l), l)]),
  ) as Record<Locale, TranslationStatus>;
  return { translations, statuses, page };
}

export async function upsertPageTranslation(
  slug: string,
  locale: string,
  body: { title: string; content: string; translationReady: boolean },
  updatedBy: string | null,
): Promise<TranslationResult<ContentPageTranslationRow>> {
  if (!isLocale(locale)) {
    return { ok: false, code: "INVALID_INPUT", message: `unknown locale: ${locale}` };
  }
  if (locale === DEFAULT_LOCALE) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      message: "Default-locale content is edited via the main page endpoint, not as a translation",
    };
  }
  if (!body.title || body.title.length > TITLE_MAX_LEN) {
    return { ok: false, code: "INVALID_INPUT", message: "title required (max 200 chars)" };
  }
  if (body.content.length > CONTENT_MAX_LEN) {
    return { ok: false, code: "INVALID_INPUT", message: `content max ${CONTENT_MAX_LEN} chars` };
  }

  const repo = await getAdminRepository();
  const page = await repo.getContentPageBySlug(slug);
  if (!page) return { ok: false, code: "NOT_FOUND", message: "Content page not found" };
  const row = await repo.upsertPageTranslation({
    slug,
    locale,
    title: body.title,
    content: body.content,
    translationReady: body.translationReady,
    sourceUpdatedAt: page.contentUpdatedAt,
    updatedBy,
  });
  return { ok: true, data: row };
}

export async function deletePageTranslation(
  slug: string,
  locale: string,
): Promise<TranslationResult<true>> {
  if (!isLocale(locale)) {
    return { ok: false, code: "INVALID_INPUT", message: `unknown locale: ${locale}` };
  }
  if (locale === DEFAULT_LOCALE) {
    return { ok: false, code: "INVALID_INPUT", message: "Cannot delete the default-locale source" };
  }
  const repo = await getAdminRepository();
  const removed = await repo.deletePageTranslation(slug, locale);
  if (!removed) return { ok: false, code: "NOT_FOUND", message: "Translation not found" };
  return { ok: true, data: true };
}
