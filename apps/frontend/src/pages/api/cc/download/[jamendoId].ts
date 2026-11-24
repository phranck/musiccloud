export const prerender = false;

import { parseJamendoAudioFormat, visitorAddress } from "@musiccloud/shared";
import type { APIRoute } from "astro";
import { fetchCcDownload } from "@/api/client";
import { relayHeaders } from "@/api/proxy-response";

/** Upstream headers relayed so the browser downloads a correctly named file. */
const PASSTHROUGH_HEADERS = ["content-type", "content-length", "content-disposition", "cache-control"];

/**
 * Thin download proxy: forwards GET to the backend `/api/v1/cc/download/:jamendoId`
 * and relays the audio back from the same origin as a named attachment. Because
 * the request never leaves our origin, the link's `download` attribute and the
 * upstream `Content-Disposition` filename take effect. A direct cross-origin
 * Jamendo link is instead saved as `.html` with no controllable name.
 */
export const GET: APIRoute = async ({ params, request, clientAddress }) => {
  const jamendoId = params.jamendoId;
  if (!jamendoId) return new Response(null, { status: 400 });

  const formatParam = new URL(request.url).searchParams.get("format");
  const format = formatParam ? parseJamendoAudioFormat(formatParam) : undefined;
  const upstream = await fetchCcDownload(jamendoId, visitorAddress({ request, clientAddress }), format);
  if (!upstream.ok) return new Response(null, { status: upstream.status });

  return new Response(upstream.body, { status: upstream.status, headers: relayHeaders(upstream, PASSTHROUGH_HEADERS) });
};
