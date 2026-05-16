import type { Locale, LocalizedText } from "@musiccloud/shared";
import { normalizeLocalizedText, setLocalizedText } from "@musiccloud/shared";

type PageTitleTranslation = { locale: Locale; title?: string };
type PageTitleDrafts = Record<string, { current: { title?: string } }>;

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
