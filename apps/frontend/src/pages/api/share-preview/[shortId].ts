export const prerender = false;

import type { APIRoute } from "astro";
import { fetchSharePreview } from "@/api/client";

/**
 * Thin proxy: forwards GET to backend `/api/v1/share/:shortId/preview`.
 * Called client-side from AudioPreviewPlayer when the initial share page
 * arrives with `previewRefreshable: true`.
 */
export const GET: APIRoute = async ({ params }) => {
  const shortId = params.shortId;
  if (!shortId) return new Response(null, { status: 400 });

  const result = await fetchSharePreview(shortId);
  if (result === null) return new Response(null, { status: 503 });
  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
  });
};
