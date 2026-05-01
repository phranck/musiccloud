import type { APIRoute } from "astro";

import { fetchArtistInfo } from "@/api/client";

export const prerender = false;

/**
 * Proxy GET /api/artist-info?name=&region= → backend /api/v1/artist-info.
 *
 * Forwards the user's IP via `X-Forwarded-For` so the backend's per-IP
 * rate limiter (`apiRateLimiter`, shared 10/min bucket) buckets per real
 * user instead of the frontend pod. See
 * `apps/backend/src/lib/infra/rate-limiter.ts:67-72` for the rationale.
 */
export const GET: APIRoute = async ({ url, clientAddress }) => {
  const name = url.searchParams.get("name") ?? "";
  const region = url.searchParams.get("region") ?? "";

  if (!name.trim()) {
    return new Response(JSON.stringify({ error: "INVALID_REQUEST", message: "'name' is required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const res = await fetchArtistInfo(name, region || undefined, clientAddress);

  return new Response(res.body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
};
