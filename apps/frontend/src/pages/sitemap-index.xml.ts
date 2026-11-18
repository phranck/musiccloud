/**
 * @file The sitemap index that `robots.txt` names, pointing at the one list.
 */

import type { APIRoute } from "astro";
import { renderSitemapIndex, SITEMAP_CONTENT_TYPE } from "@/lib/seo/sitemap";

export const prerender = false;

/** How long a crawler or a cache may keep the index: a day, because it never changes. */
const SITEMAP_INDEX_CACHE_CONTROL = "public, max-age=86400";

/** Answers the index. */
export const GET: APIRoute = () =>
  new Response(renderSitemapIndex(), {
    headers: { "Content-Type": SITEMAP_CONTENT_TYPE, "Cache-Control": SITEMAP_INDEX_CACHE_CONTROL },
  });
