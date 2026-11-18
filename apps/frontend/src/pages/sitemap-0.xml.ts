/**
 * @file The sitemap's one list of addresses: the home page and every published
 * content page, read from the backend on each request.
 */

import { visitorAddress } from "@musiccloud/shared";
import type { APIRoute } from "astro";
import { fetchPublishedContentPages } from "@/api/client";
import { renderUrlSet, SITEMAP_CONTENT_TYPE, sitemapAddresses } from "@/lib/seo/sitemap";

export const prerender = false;

/**
 * How long a crawler or a cache may keep the list: an hour, as long as the
 * backend lets the list of pages be cached.
 */
const SITEMAP_CACHE_CONTROL = "public, max-age=3600";

/**
 * How long a crawler should wait before asking again when the list could not
 * be read, in seconds: 600.
 */
const RETRY_AFTER_SECONDS = 600;

/**
 * Answers the list. When the backend does not answer, the list is refused with
 * 503 rather than served with the home page alone, because a crawler reads a
 * list that has lost every page as those pages being gone.
 */
export const GET: APIRoute = async ({ request, clientAddress }) => {
  const pages = await fetchPublishedContentPages(visitorAddress({ request, clientAddress }));
  if (!pages) {
    return new Response(null, { status: 503, headers: { "Retry-After": String(RETRY_AFTER_SECONDS) } });
  }
  return new Response(renderUrlSet(sitemapAddresses(pages)), {
    headers: { "Content-Type": SITEMAP_CONTENT_TYPE, "Cache-Control": SITEMAP_CACHE_CONTROL },
  });
};
