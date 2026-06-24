import type { Locale } from "@/i18n/locales";
import type { GenreSearchPayload } from "@/lib/types/app";

/** The parsed query shape the headline is built from. */
export type QueryDetails = GenreSearchPayload["queryDetails"];

/**
 * The translation function the headline builder needs: a key plus optional
 * interpolation vars, returning the localized string.
 */
export type TFunc = (key: string, vars?: Record<string, string>) => string;

/**
 * Builds the locale-aware natural-language headline that summarizes a parsed
 * genre-search query, e.g.
 *
 *   en:  "10 tracks, albums and artists in jazz"
 *        "20 tracks and 10 albums in jazz or rock — a mixed selection"
 *   de:  "10 Tracks, Alben und Künstler aus Jazz"
 *        "20 Tracks und 10 Alben aus Jazz oder Rock – bunt gemischt"
 *
 * Pure: all wording comes through `t`; only the casing of genre names is
 * locale-specific (see {@link formatGenre}).
 *
 * @param q - The parsed query details (genres, vibe, per-type counts).
 * @param t - The translation function.
 * @param locale - The active locale, used for genre-name casing.
 * @returns The assembled headline string.
 */
export function buildHeadline(q: QueryDetails, t: TFunc, locale: Locale): string {
  const genreText = formatList(
    q.genres.map((g) => formatGenre(g, locale)),
    t("genreSearch.summary.or"),
  );
  const countsText = buildCountsText(q, t);
  const key = q.vibe === "mixed" ? "genreSearch.summary.mixed" : "genreSearch.summary.hot";
  return t(key, { counts: countsText, genres: genreText });
}

/**
 * Assembles the "N tracks and M albums"-style count phrase. When every
 * requested type shares the same count, collapses to a single "N of all types"
 * phrase instead of repeating the number per type.
 */
function buildCountsText(q: QueryDetails, t: TFunc): string {
  const hasT = q.tracks !== null;
  const hasA = q.albums !== null;
  const hasAr = q.artists !== null;
  const allEqual = hasT && hasA && hasAr && q.tracks === q.albums && q.albums === q.artists;

  if (allEqual) {
    return `${q.tracks} ${t("genreSearch.summary.allTypes")}`;
  }

  const parts: string[] = [];
  if (hasT) parts.push(`${q.tracks} ${t(q.tracks === 1 ? "genreSearch.summary.track" : "genreSearch.summary.tracks")}`);
  if (hasA) parts.push(`${q.albums} ${t(q.albums === 1 ? "genreSearch.summary.album" : "genreSearch.summary.albums")}`);
  if (hasAr)
    parts.push(`${q.artists} ${t(q.artists === 1 ? "genreSearch.summary.artist" : "genreSearch.summary.artists")}`);

  return formatList(parts, t("genreSearch.summary.and"));
}

/**
 * Casing-normalizes a genre name for running text. German treats genre names as
 * substantives (title-cased); most other languages keep them lowercase.
 */
function formatGenre(raw: string, locale: Locale): string {
  // Languages where nouns are routinely capitalised in running text.
  const titleCaseLocales: Locale[] = ["de"];
  if (titleCaseLocales.includes(locale)) {
    return raw.replace(/(^|\s|&|\/)([a-z])/g, (_m, sep, ch) => sep + ch.toUpperCase());
  }
  return raw.toLowerCase();
}

/** Joins items with commas and a final conjunction ("a, b and c"). */
function formatList(items: string[], conjunction: string): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} ${conjunction} ${items[items.length - 1]}`;
}
