import { visitorAddress } from "@musiccloud/shared";
import type { APIRoute } from "astro";

import { fetchArtistInfo } from "@/api/client";
import { badRequestResponse, relayHeaders } from "@/api/proxy-response";

export const prerender = false;

/** The `Content-Type` of the answer when the backend names none: JSON. */
const DEFAULT_CONTENT_TYPE = "application/json";

/** The backend headers the answer passes on unchanged: what the body is and how long it may be cached. */
const FORWARDED_HEADERS = ["Content-Type", "Cache-Control"] as const;

/**
 * Proxy GET /api/artist-info?name=&artistEntityId=&region= → backend
 * /api/v1/artist-info.
 *
 * Forwards the user's IP via `X-Forwarded-For` so the backend's per-IP
 * rate limiter (`apiRateLimiter`, shared 10 requests per 60 seconds bucket)
 * buckets per real user instead of the frontend pod. See
 * `apps/backend/src/lib/infra/rate-limiter.ts:67-72` for the rationale.
 */
export const GET: APIRoute = async ({ request, url, clientAddress }) => {
  const name = url.searchParams.get("name") ?? "";
  const artistEntityId = url.searchParams.get("artistEntityId") ?? "";
  const region = url.searchParams.get("region") ?? "";
  const shortId = url.searchParams.get("shortId") ?? "";
  const refresh = url.searchParams.get("refresh") === "profile" ? "profile" : undefined;

  if (!name.trim() && !artistEntityId.trim()) return badRequestResponse();

  const res = await fetchArtistInfo(name, region || undefined, visitorAddress({ request, clientAddress }), {
    shortId: shortId || undefined,
    artistEntityId: artistEntityId || undefined,
    refresh,
  });

  return new Response(res.body, {
    status: res.status,
    headers: relayHeaders(res, FORWARDED_HEADERS, { "Content-Type": DEFAULT_CONTENT_TYPE }),
  });
};
