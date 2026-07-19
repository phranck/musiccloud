import { DEFAULT_LOCALE, type Locale } from "./locales.js";

export type LocalizedText = Partial<Record<Locale, string>>;

export interface LocalizedTextConflict {
  locale: string;
  kept: string;
  ignored: string;
  source: string;
}

export interface NormalizedLocalizedText {
  value: LocalizedText;
  conflicts: LocalizedTextConflict[];
}

export interface NormalizeLocalizedTextOptions {
  defaultLocale?: Locale;
  translations?: unknown;
  source?: string;
  translationsSource?: string;
}

export interface LocalizedTextRead {
  value: string;
  fallback: string;
  hasValue: boolean;
  isFallback: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function assignLocalizedValue(
  target: Record<string, string>,
  conflicts: LocalizedTextConflict[],
  locale: string,
  value: unknown,
  source: string,
): void {
  if (typeof value !== "string") return;
  const existing = target[locale];
  if (existing !== undefined && existing !== value) {
    conflicts.push({ locale, kept: existing, ignored: value, source });
    return;
  }
  target[locale] = value;
}

function assignLocalizedMap(
  target: Record<string, string>,
  conflicts: LocalizedTextConflict[],
  value: unknown,
  source: string,
): void {
  if (!isPlainObject(value)) return;
  for (const [locale, text] of Object.entries(value)) {
    assignLocalizedValue(target, conflicts, locale, text, source);
  }
}

export function normalizeLocalizedText(
  input: unknown,
  options: NormalizeLocalizedTextOptions = {},
): NormalizedLocalizedText {
  const defaultLocale = options.defaultLocale ?? DEFAULT_LOCALE;
  const source = options.source ?? "value";
  const translationsSource = options.translationsSource ?? "translations";
  const value: Record<string, string> = {};
  const conflicts: LocalizedTextConflict[] = [];

  if (typeof input === "string") {
    assignLocalizedValue(value, conflicts, defaultLocale, input, source);
  } else {
    assignLocalizedMap(value, conflicts, input, source);
  }

  assignLocalizedMap(value, conflicts, options.translations, translationsSource);

  return { value: value as LocalizedText, conflicts };
}

export function getLocalizedText(
  value: LocalizedText | undefined | null,
  locale: Locale,
  fallbackLocale: Locale = DEFAULT_LOCALE,
): LocalizedTextRead {
  const direct = value?.[locale];
  const fallback = value?.[fallbackLocale] ?? "";
  if (direct !== undefined) {
    return { value: direct, fallback, hasValue: true, isFallback: false };
  }
  return { value: "", fallback, hasValue: false, isFallback: fallback.length > 0 };
}

export function setLocalizedText(
  value: LocalizedText | undefined | null,
  locale: Locale,
  nextValue: string,
): LocalizedText {
  return { ...(value ?? {}), [locale]: nextValue };
}
