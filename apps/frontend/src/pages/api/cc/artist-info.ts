import type { APIRoute } from "astro";

import { fetchCcArtistInfo } from "@/api/client";

export const prerender = false;

/**
 * Proxy GET /api/cc/artist-info?jamendoArtistId=&artistName= → backend
 * /api/v1/cc/artist-info. The CC share page / live result load the artist column
 * through this async, after the core card renders. Forwards the visitor IP for
 * the backend's per-IP rate limiter.
 */
export const GET: APIRoute = async ({ url, clientAddress }) => {
  const jamendoArtistId = url.searchParams.get("jamendoArtistId") ?? "";
  const artistName = url.searchParams.get("artistName") ?? "";

  if (!jamendoArtistId.trim() || !artistName.trim()) {
    return new Response(
      JSON.stringify({ error: "INVALID_REQUEST", message: "'jamendoArtistId' and 'artistName' are required." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const res = await fetchCcArtistInfo(jamendoArtistId, artistName, clientAddress);
  return new Response(res.body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
};
