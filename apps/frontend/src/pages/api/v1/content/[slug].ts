export const prerender = false;

import { visitorAddress } from "@musiccloud/shared";
import type { APIRoute } from "astro";

import { fetchPublicContentPage } from "@/api/client";
import { badRequestResponse } from "@/api/proxy-response";

/** The headers of every answer: a JSON body that no cache may keep. */
const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };

/**
 * Browser-reachable proxy for `/api/v1/content/:slug`, used by the nav-click
 * interceptor to hydrate an overlay page without a full-route navigation.
 */
export const GET: APIRoute = async ({ request, params, clientAddress }) => {
  const slug = params.slug;
  if (typeof slug !== "string" || slug.length === 0) return badRequestResponse(JSON_HEADERS);
  const result = await fetchPublicContentPage(slug, visitorAddress({ request, clientAddress }));
  if (result.kind === "success") {
    return new Response(JSON.stringify(result.data), { headers: JSON_HEADERS });
  }

  if (result.kind === "error") {
    return new Response(JSON.stringify(result.error), { status: result.statusCode, headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify(result.error), { status: 404, headers: JSON_HEADERS });
};
