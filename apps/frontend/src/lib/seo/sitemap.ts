/**
 * @file The site's sitemap, built from the pages the site publishes.
 *
 * The content pages live in the database, so the sitemap is written per
 * request from the backend's list rather than once at build time; a page
 * published in the dashboard is listed without a deploy. The two addresses are
 * the ones `robots.txt` and search consoles already know: an index at
 * `/sitemap-index.xml`, which `robots.txt` names, that points at the one list
 * at {@link SITEMAP_PATH}. Each address is the name of its endpoint file in
 * `src/pages/`.
 */

import { type PublicContentPageStub, SITE_ORIGIN } from "@musiccloud/shared";

/** Where the one list of addresses is served, as the index names it. */
export const SITEMAP_PATH = "/sitemap-0.xml";

/** The sitemap protocol's namespace. */
const SITEMAP_NAMESPACE = "http://www.sitemaps.org/schemas/sitemap/0.9";

/** The content type both documents are served with. */
export const SITEMAP_CONTENT_TYPE = "application/xml; charset=utf-8";

/** The characters XML requires to be escaped in text, with their escapes. */
const XML_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

/**
 * Escapes text for an XML element.
 *
 * @param text - Any text, such as an address.
 * @returns The text with every character XML reserves written as its escape.
 */
function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => XML_ESCAPES[character] ?? character);
}

/**
 * Every address the site wants found: the home page, then each published
 * content page at the address its canonical link names.
 *
 * @param pages - The published pages, as `GET /api/v1/content` lists them.
 * @returns The absolute addresses, the home page first and no address twice.
 */
export function sitemapAddresses(pages: readonly PublicContentPageStub[]): string[] {
  const home = `${SITE_ORIGIN.site}/`;
  const addresses = pages.map((page) => `${SITE_ORIGIN.site}/${encodeURIComponent(page.slug)}`);
  return [...new Set([home, ...addresses])];
}

/**
 * The list of addresses, as the sitemap protocol writes it.
 *
 * @param addresses - Absolute addresses.
 * @returns The `urlset` document.
 */
export function renderUrlSet(addresses: readonly string[]): string {
  const entries = addresses.map((address) => `<url><loc>${escapeXml(address)}</loc></url>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="${SITEMAP_NAMESPACE}">${entries}</urlset>`;
}

/**
 * The index, pointing at the one list.
 *
 * @returns The `sitemapindex` document.
 */
export function renderSitemapIndex(): string {
  const list = escapeXml(`${SITE_ORIGIN.site}${SITEMAP_PATH}`);
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="${SITEMAP_NAMESPACE}"><sitemap><loc>${list}</loc></sitemap></sitemapindex>`;
}
