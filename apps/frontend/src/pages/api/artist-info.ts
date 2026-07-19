import type { APIRoute } from "astro";

import { fetchArtistInfo } from "@/api/client";

export const prerender = false;

/**
 * Proxy GET /api/artist-info?name=&artistEntityId=&region= → backend
 * /api/v1/artist-info.
 *
 * Forwards the user's IP via `X-Forwarded-For` so the backend's per-IP
 * rate limiter (`apiRateLimiter`, shared 10 requests per 60 seconds bucket)
 * buckets per real user instead of the frontend pod. See
 * `apps/backend/src/lib/infra/rate-limiter.ts:67-72` for the rationale.
 */
export const GET: APIRoute = async ({ url, clientAddress }) => {
  const name = url.searchParams.get("name") ?? "";
  const artistEntityId = url.searchParams.get("artistEntityId") ?? "";
  const region = url.searchParams.get("region") ?? "";
  const shortId = url.searchParams.get("shortId") ?? "";
  const refresh = url.searchParams.get("refresh") === "profile" ? "profile" : undefined;

  if (!name.trim() && !artistEntityId.trim()) {
    return new Response(
      JSON.stringify({
        error: "MC-REQ-0001",
        errorId: crypto.randomUUID(),
        message: "The request is invalid. (MC-REQ-0001)",
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const res = await fetchArtistInfo(name, region || undefined, clientAddress, {
    shortId: shortId || undefined,
    artistEntityId: artistEntityId || undefined,
    refresh,
  });

  return new Response(res.body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
};
