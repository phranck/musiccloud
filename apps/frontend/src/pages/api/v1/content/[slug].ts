export const prerender = false;

import type { APIRoute } from "astro";

import { fetchPublicContentPage } from "@/api/client";

/**
 * Browser-reachable proxy for `/api/v1/content/:slug` — used by the nav-click
 * interceptor to hydrate an overlay page without a full-route navigation.
 */
export const GET: APIRoute = async ({ params }) => {
  const slug = params.slug;
  if (typeof slug !== "string" || slug.length === 0) {
    return new Response(null, { status: 400 });
  }
  try {
    const page = await fetchPublicContentPage(slug);
    if (!page) return new Response(null, { status: 404 });
    return new Response(JSON.stringify(page), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return new Response(null, { status: 503 });
  }
};
