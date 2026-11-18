/**
 * @file The description of a content page, read from the page itself.
 *
 * A content page carries no description of its own, so the one a search
 * engine shows under its title is the page's first paragraph that says
 * something. The page's HTML is the backend's sanitized rendering, so reading
 * its paragraphs needs no parser; what comes out is plain text, and the
 * attribute it goes into is escaped by Astro.
 */

import { SITE_DESCRIPTION } from "./siteMeta";

/**
 * The fewest characters a paragraph needs to describe a page: 50. A shorter
 * one is a date line or a label, such as "Last updated: 18 November 2026".
 */
const DESCRIPTION_MIN_LENGTH = 50;

/**
 * The most characters a description runs to: 160, about what a search engine
 * shows before it cuts the snippet itself.
 */
export const DESCRIPTION_MAX_LENGTH = 160;

/** What ends a description that was cut short. */
const ELLIPSIS = "…";

/** One paragraph of the page, with what stands inside it. */
const PARAGRAPH = /<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/gi;

/** Any tag. */
const TAG = /<[^>]*>/g;

/** A character reference, named or numeric. */
const CHARACTER_REFERENCE = /&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi;

/** The named references the backend's sanitizer writes, by name. */
const NAMED_REFERENCES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** A run of whitespace, which a description writes as one space. */
const WHITESPACE = /\s+/g;

/**
 * Turns character references back into the characters they stand for.
 *
 * @param text - Text that may hold references such as `&amp;` or `&#39;`.
 * @returns The text with every known reference replaced; an unknown one stays as written.
 */
function decodeReferences(text: string): string {
  return text.replace(CHARACTER_REFERENCE, (reference, name: string) => {
    if (name.startsWith("#x") || name.startsWith("#X")) return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
    if (name.startsWith("#")) return String.fromCodePoint(Number.parseInt(name.slice(1), 10));
    return NAMED_REFERENCES[name.toLowerCase()] ?? reference;
  });
}

/**
 * Cuts a text to {@link DESCRIPTION_MAX_LENGTH} at the last word that fits.
 *
 * @param text - The text, already plain and on one line.
 * @returns The text as it is when it fits, otherwise its longest run of whole
 *   words that fits with an ellipsis after it.
 */
function cutToLength(text: string): string {
  if (text.length <= DESCRIPTION_MAX_LENGTH) return text;
  const room = text.slice(0, DESCRIPTION_MAX_LENGTH - ELLIPSIS.length);
  const lastSpace = room.lastIndexOf(" ");
  const words = lastSpace > 0 ? room.slice(0, lastSpace) : room;
  return `${words.replace(/[\s,;:.]+$/, "")}${ELLIPSIS}`;
}

/**
 * The description of a content page.
 *
 * @param html - The page's rendered HTML, as the backend serves it in `contentHtml`.
 * @returns The page's first paragraph of at least {@link DESCRIPTION_MIN_LENGTH}
 *   characters as plain text, cut to {@link DESCRIPTION_MAX_LENGTH}, or
 *   `SITE_DESCRIPTION` where the page holds no such paragraph.
 */
export function describeContentPage(html: string): string {
  for (const [, inner] of html.matchAll(PARAGRAPH)) {
    const text = decodeReferences(inner.replace(TAG, " ")).replace(WHITESPACE, " ").trim();
    if (text.length >= DESCRIPTION_MIN_LENGTH) return cutToLength(text);
  }
  return SITE_DESCRIPTION;
}
