/**
 * @file Splits rendered page HTML around the placeholders a component fills.
 *
 * Most shortcodes reach the portal as finished markup and are injected in one
 * piece. A few cannot: they need data fetched where the page is served, or a
 * component the reader interacts with. Those arrive as an empty placeholder,
 * and the page has to render its own component in that position.
 *
 * That means the HTML can no longer be injected as one string, so it is cut
 * into the runs of markup between the placeholders. Everything else about how
 * the page is injected stays as it was.
 */

import { PLANS_PLACEHOLDER_ATTRIBUTE } from "@musiccloud/shared";

/** What a piece of a page is. */
export const EditorialSegmentKind = {
  /** Sanitized markup, injected as it stands. */
  Html: "Html",
  /** The live plan list, rendered by the portal's own component. */
  Plans: "Plans",
} as const;

/** One of the kinds in {@link EditorialSegmentKind}. */
export type EditorialSegmentKindValue = (typeof EditorialSegmentKind)[keyof typeof EditorialSegmentKind];

/** One piece of a page, in the order it appears. */
export type EditorialSegment =
  | { kind: typeof EditorialSegmentKind.Html; html: string }
  | { kind: typeof EditorialSegmentKind.Plans; heading: string };

/**
 * Matches one plans placeholder and captures its heading.
 *
 * The element is emitted by the backend and has already been through the
 * sanitizer, so its shape is known exactly: one `div`, one attribute, no
 * content. This is not a general HTML parser and does not need to be.
 */
const PLANS_PLACEHOLDER = new RegExp(`<div ${PLANS_PLACEHOLDER_ATTRIBUTE}="([^"]*)"></div>`, "g");

/**
 * Cuts a page into the pieces the portal renders separately.
 *
 * @param html - The sanitized page markup, as the backend returned it.
 * @returns The pieces, in order. A page with no placeholders comes back as one
 *   `Html` piece, which is what almost every page is.
 */
export function splitEditorialSegments(html: string): EditorialSegment[] {
  const segments: EditorialSegment[] = [];
  let cursor = 0;

  for (const match of html.matchAll(PLANS_PLACEHOLDER)) {
    if (match.index === undefined) continue;
    if (match.index > cursor) {
      segments.push({ kind: EditorialSegmentKind.Html, html: html.slice(cursor, match.index) });
    }
    segments.push({ kind: EditorialSegmentKind.Plans, heading: match[1] });
    cursor = match.index + match[0].length;
  }

  if (cursor < html.length) {
    segments.push({ kind: EditorialSegmentKind.Html, html: html.slice(cursor) });
  }

  return segments;
}
