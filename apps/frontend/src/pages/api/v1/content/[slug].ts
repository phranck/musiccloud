export const prerender = false;

import type { APIRoute } from "astro";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@musiccloud/shared";

import { fetchPublicContentPage } from "@/api/client";

/**
 * Browser-reachable proxy for `/api/v1/content/:slug` — used by the nav-click
 * interceptor to hydrate an overlay page without a full-route navigation.
 */
export const GET: APIRoute = async ({ params, request, cookies }) => {
  const slug = params.slug;
  if (typeof slug !== "string" || slug.length === 0) {
    return new Response(null, { status: 400 });
  }
  const q = new URL(request.url).searchParams.get("locale");
  const cookieVal = cookies.get("mc:locale")?.value;
  const locale: Locale = isLocale(q) ? q : isLocale(cookieVal) ? cookieVal : DEFAULT_LOCALE;
  try {
    const page = await fetchPublicContentPage(slug, locale);
    if (!page) return new Response(null, { status: 404 });
    return new Response(JSON.stringify(page), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return new Response(null, { status: 503 });
  }
};
