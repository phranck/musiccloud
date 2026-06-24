import type { APIRoute } from "astro";
import { fetchCcBandcamp } from "@/api/client";

export const prerender = false;

/**
 * Proxy GET /api/cc/bandcamp/:jamendoId → backend /api/v1/cc/bandcamp/:jamendoId.
 * The CC share page loads the Bandcamp presence through this async, after the
 * core card renders. Forwards the visitor IP for the backend's per-IP rate limiter.
 */
export const GET: APIRoute = async ({ params, clientAddress }) => {
  const jamendoId = params.jamendoId;
  if (!jamendoId) return new Response(null, { status: 400 });

  const res = await fetchCcBandcamp(jamendoId, clientAddress);
  return new Response(res.body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
};
