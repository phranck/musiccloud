/**
 * @file Gives every heading an id, so a page can be linked into.
 *
 * Markdown has no syntax for an anchor, and marked emits none, so a heading a
 * writer can see has no address a link can reach. That matters as soon as one
 * page points into another: `/pricing` links to `/docs#how-it-fits-together`,
 * and without this the link lands at the top of the page and the reader has to
 * find the section themselves.
 *
 * The id is derived from the heading's own words rather than written by hand,
 * because a heading and its anchor are the same thing said twice and the second
 * one would go out of step. The cost is that renaming a heading changes its
 * address, which is what a link into somebody else's prose is always worth.
 */

import type { MarkedExtension, Tokens } from "marked";

/**
 * Turns a heading into the id a link can name.
 *
 * Lower case, words joined by hyphens, everything else dropped. A heading
 * beginning with a digit gets a prefix, because an id has to start with a
 * letter and the sanitizer enforces that.
 *
 * @param text - The heading, as rendered, with any markup already removed.
 * @returns The id, or an empty string when the heading carries no letters or
 *   digits at all.
 */
export function headingId(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize("NFKD")
    // Combining marks, so "Übersicht" becomes "ubersicht" rather than losing
    // the letter the mark sat on.
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) return "";
  return /^[a-z]/.test(slug) ? slug : `section-${slug}`;
}

/**
 * How many headings have already claimed each id, per render.
 *
 * A page may say "Overview" twice, and two elements sharing an id make one of
 * them unreachable. The counter is reset on every top-level render, which is
 * what keeps one page's headings from numbering the next page's.
 */
let claimedIds = new Map<string, number>();

/**
 * Claims an id, making it unique within this render.
 *
 * @param id - The id derived from the heading.
 * @returns The same id the first time, and a numbered one after that.
 */
function claimId(id: string): string {
  const seen = claimedIds.get(id) ?? 0;
  claimedIds.set(id, seen + 1);
  return seen === 0 ? id : `${id}-${seen + 1}`;
}

/**
 * Forgets every id claimed so far.
 *
 * Called before each document is rendered, so the second render of the same
 * page produces the same anchors as the first.
 */
export function resetHeadingIds(): void {
  claimedIds = new Map();
}

/**
 * Heading anchors as a marked extension.
 *
 * @returns The extension, ready to register.
 */
export function createHeadingAnchorExtension(): MarkedExtension {
  return {
    renderer: {
      heading({ tokens, depth }: Tokens.Heading): string {
        const html = this.parser.parseInline(tokens);
        // From the rendered text with its markup taken out, so a heading with a
        // link or a piece of code in it yields the words rather than the markup
        // around them.
        const id = headingId(html.replace(/<[^>]*>/g, ""));
        const attribute = id ? ` id="${claimId(id)}"` : "";
        return `<h${depth}${attribute}>${html}</h${depth}>\n`;
      },
    },
  };
}
