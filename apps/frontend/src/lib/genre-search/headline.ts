import { discoveryCopy } from "@/copy/discovery";
import type { GenreSearchPayload } from "@/lib/types/app";

/** The parsed query shape the headline is built from. */
export type QueryDetails = GenreSearchPayload["queryDetails"];

/**
 * Builds the English natural-language headline that summarizes a parsed
 * genre-search query, e.g.
 *
 *   en:  "10 tracks, albums and artists in jazz"
 *        "20 tracks and 10 albums in jazz or rock — a mixed selection"
 * @param q - The parsed query details (genres, vibe, per-type counts).
 * @returns The assembled headline string.
 */
export function buildHeadline(q: QueryDetails): string {
  const copy = discoveryCopy.genreSearch.summary;
  const genreText = formatList(q.genres.map(formatGenre), copy.or);
  const countsText = buildCountsText(q);
  return q.vibe === "mixed" ? copy.mixed(countsText, genreText) : copy.hot(countsText, genreText);
}

/**
 * Assembles the "N tracks and M albums"-style count phrase. When every
 * requested type shares the same count, collapses to a single "N of all types"
 * phrase instead of repeating the number per type.
 */
function buildCountsText(q: QueryDetails): string {
  const copy = discoveryCopy.genreSearch.summary;
  const hasT = q.tracks !== null;
  const hasA = q.albums !== null;
  const hasAr = q.artists !== null;
  const allEqual = hasT && hasA && hasAr && q.tracks === q.albums && q.albums === q.artists;

  if (allEqual) {
    return `${q.tracks} ${copy.allTypes}`;
  }

  const parts: string[] = [];
  if (hasT) parts.push(`${q.tracks} ${q.tracks === 1 ? copy.track : copy.tracks}`);
  if (hasA) parts.push(`${q.albums} ${q.albums === 1 ? copy.album : copy.albums}`);
  if (hasAr) parts.push(`${q.artists} ${q.artists === 1 ? copy.artist : copy.artists}`);

  return formatList(parts, copy.and);
}

/** Casing-normalizes a genre name for English running text. */
function formatGenre(raw: string): string {
  return raw.toLowerCase();
}

/** Joins items with commas and a final conjunction ("a, b and c"). */
function formatList(items: string[], conjunction: string): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} ${conjunction} ${items[items.length - 1]}`;
}
