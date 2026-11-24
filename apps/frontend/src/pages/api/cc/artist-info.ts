import { visitorAddress } from "@musiccloud/shared";
import type { APIRoute } from "astro";

import { fetchCcArtistInfo } from "@/api/client";
import { badRequestResponse } from "@/api/proxy-response";

export const prerender = false;

/**
 * Proxy GET /api/cc/artist-info?jamendoArtistId=&artistName= → backend
 * /api/v1/cc/artist-info. The CC share page / live result load the artist column
 * through this async, after the core card renders. Forwards the visitor IP for
 * the backend's per-IP rate limiter.
 */
export const GET: APIRoute = async ({ request, url, clientAddress }) => {
  const jamendoArtistId = url.searchParams.get("jamendoArtistId") ?? "";
  const artistName = url.searchParams.get("artistName") ?? "";

  if (!jamendoArtistId.trim() || !artistName.trim()) return badRequestResponse();

  const res = await fetchCcArtistInfo(jamendoArtistId, artistName, visitorAddress({ request, clientAddress }));
  return new Response(res.body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
};
