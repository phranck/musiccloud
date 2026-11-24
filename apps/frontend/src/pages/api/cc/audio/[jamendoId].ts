export const prerender = false;

import { parseJamendoAudioFormat, visitorAddress } from "@musiccloud/shared";
import type { APIRoute } from "astro";
import { fetchCcAudio } from "@/api/client";
import { badRequestResponse, relayErrorResponse, relayHeaders } from "@/api/proxy-response";

/** Upstream headers relayed verbatim so the `<audio>` element can range-seek. */
const PASSTHROUGH_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges", "cache-control"];

/**
 * Thin streaming proxy: forwards GET (with the visitor's `Range` header) to the
 * backend `/api/v1/cc/audio/:jamendoId` and relays the audio stream back from
 * the same origin. This lets the player's `<audio crossorigin="anonymous">`
 * load CC tracks. Jamendo's storage server omits the Range CORS headers the
 * Web-Audio analyser needs, but here the request never leaves our origin.
 *
 * A missing id is refused with `400` and `MC-REQ-0001`, and a backend refusal
 * passes on with its status and error body.
 */
export const GET: APIRoute = async ({ params, request, clientAddress }) => {
  const jamendoId = params.jamendoId;
  if (!jamendoId) return badRequestResponse();

  const formatParam = new URL(request.url).searchParams.get("format");
  const format = formatParam ? parseJamendoAudioFormat(formatParam) : undefined;
  const upstream = await fetchCcAudio(
    jamendoId,
    request.headers.get("range"),
    visitorAddress({ request, clientAddress }),
    format,
  );
  // `ok` covers `206`, the partial answer to a `Range` request.
  if (!upstream.ok) return relayErrorResponse(upstream);

  return new Response(upstream.body, { status: upstream.status, headers: relayHeaders(upstream, PASSTHROUGH_HEADERS) });
};
