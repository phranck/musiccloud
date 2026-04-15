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

/**
 * Extracts all `og:*` meta tags from the given HTML string.
 *
 * @param html - raw HTML response body
 * @returns map of OG key (without the `og:` prefix) to content value.
 *          Returns an empty object on HTML that has no OG tags.
 */
export function extractOgTags(html: string): Record<string, string> {
  const tags: Record<string, string> = {};
  const regex = /<meta\s+(?:property|name)="og:(\w+)"\s+content="([^"]*)"[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    tags[m[1]] = m[2];
  }
  return tags;
}
