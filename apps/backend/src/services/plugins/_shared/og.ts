/**
 * @file OpenGraph meta-tag extraction for scraping adapters.
 *
 * Most music service pages expose the track/album/artist metadata we
 * need as `<meta property="og:title">` etc. The regex matches both
 * `property="og:..."` (standard) and `name="og:..."` (sometimes emitted
 * by Korean/Chinese services and older templates) so a single helper
 * handles every scraper we currently have.
 *
 * The implementation is deliberately regex-based rather than a full
 * DOM parser: the scraper path only cares about a handful of OG keys,
 * pages can be several hundred KB, and shipping a DOM library into
 * the serverless bundle for this would be disproportionate.
 */

import { decodeHtmlEntities } from "../../../lib/html.js";

/**
 * Extracts all `og:*` meta tags from the given HTML string.
 *
 * A `content` attribute is HTML, so its entities are decoded once: a page's
 * `God&#x27;s Plan` reads as `God's Plan`, and `&amp;` in an image URL as `&`.
 *
 * @param html - raw HTML response body
 * @returns map of OG key (without the `og:` prefix) to the decoded content
 *          value. Returns an empty object on HTML that has no OG tags.
 */
export function extractOgTags(html: string): Record<string, string> {
  const tags: Record<string, string> = {};
  const regex = /<meta\s+(?:property|name)="og:(\w+)"\s+content="([^"]*)"[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    tags[match[1]] = decodeHtmlEntities(match[2]);
  }
  return tags;
}
