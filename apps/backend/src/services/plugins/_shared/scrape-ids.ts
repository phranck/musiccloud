/**
 * @file Result-id extraction from provider search pages.
 *
 * Search pages of the scraping adapters list their hits only as ids inside
 * the HTML, such as `data-song-no="123"` or `/track/123` links. The adapter
 * collects the first few distinct ids in page order and fetches each hit's
 * own page.
 */

/**
 * Collects the first distinct ids a pattern finds in a page.
 *
 * @param html - The search page.
 * @param pattern - A pattern with the `g` flag whose first group captures one
 *   id. A match whose group is empty is skipped.
 * @param limit - How many distinct ids to keep at most. Scanning stops once
 *   that many are found.
 * @returns The ids in the order of their first appearance on the page, empty
 *   when the pattern finds none.
 */
export function scrapeIds(html: string, pattern: RegExp, limit: number): string[] {
  const ids = new Set<string>();
  for (const match of html.matchAll(pattern)) {
    if (match[1]) ids.add(match[1]);
    if (ids.size >= limit) break;
  }
  return [...ids];
}
