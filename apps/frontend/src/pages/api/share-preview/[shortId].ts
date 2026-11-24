import { visitorAddress } from "@musiccloud/shared";
export const prerender = false;

import type { APIRoute } from "astro";
import { fetchSharePreview } from "@/api/client";
import { backendUnavailableResponse, badRequestResponse, relayErrorResponse } from "@/api/proxy-response";

/** The `Content-Type` of a preview answer: JSON. */
const JSON_CONTENT_TYPE = "application/json";

/** This route's name in the log line of a preview answer whose body breaks off. */
const OPERATION = "share_preview_proxy";

/**
 * Thin proxy: forwards GET to backend `/api/v1/share/:shortId/preview`.
 * Called client-side from AudioPlayer when the initial share page
 * arrives with `previewRefreshable: true`.
 *
 * A missing short id is refused with `400` and `MC-REQ-0001`. A backend
 * refusal passes on with its status and error body, which is the backend
 * client's envelope when the backend could not be reached, and an answer
 * whose body breaks off is answered 503 with `MC-SYS-0002`. The player treats
 * every refusal as "no fresh preview".
 */
export const GET: APIRoute = async ({ request, params, clientAddress }) => {
  const shortId = params.shortId;
  if (!shortId) return badRequestResponse();

  try {
    const upstream = await fetchSharePreview(shortId, visitorAddress({ request, clientAddress }));
    if (!upstream.ok) return relayErrorResponse(upstream);
    return new Response(await upstream.text(), { headers: { "Content-Type": JSON_CONTENT_TYPE } });
  } catch (error) {
    return backendUnavailableResponse(error, OPERATION);
  }
};
