import type { Locale, LocalizedText, PageType } from "@musiccloud/shared";
import { normalizeLocalizedText, setLocalizedText } from "@musiccloud/shared";

type PageTitleTranslation = { locale: Locale; title?: string };
type PageTitleDrafts = Record<string, { current: { title?: string } }>;
export type PageTitleTranslationDraft = { title: string; content: string; translationReady: false };

export function buildLocalizedPageTitle(
  defaultTitle: string,
  translations: PageTitleTranslation[] = [],
  drafts: PageTitleDrafts = {},
): LocalizedText {
  const serverTranslations = Object.fromEntries(
    translations.filter((t) => t.title !== undefined).map((t) => [t.locale, t.title]),
  );
  const normalized = normalizeLocalizedText(defaultTitle, { translations: serverTranslations }).value;

  return Object.entries(drafts).reduce<LocalizedText>((acc, [locale, entry]) => {
    if (entry.current.title === undefined) return acc;
    return setLocalizedText(acc, locale as Locale, entry.current.title);
  }, normalized);
}

export function createPageTitleTranslationDraft({
  title,
  content,
  pageType,
}: {
  title: string;
  content: string;
  pageType: PageType;
}): PageTitleTranslationDraft {
  return {
    title,
    content: pageType === "segmented" ? "" : content,
    translationReady: false,
  };
}
