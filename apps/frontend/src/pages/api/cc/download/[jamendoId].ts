export const prerender = false;

import { parseJamendoAudioFormat } from "@musiccloud/shared";
import type { APIRoute } from "astro";
import { fetchCcDownload } from "@/api/client";

/** Upstream headers relayed so the browser downloads a correctly named file. */
const PASSTHROUGH_HEADERS = ["content-type", "content-length", "content-disposition", "cache-control"];

/**
 * Thin download proxy: forwards GET to the backend `/api/v1/cc/download/:jamendoId`
 * and relays the audio back from the same origin as a named attachment. Because
 * the request never leaves our origin, the link's `download` attribute and the
 * upstream `Content-Disposition` filename take effect — a direct cross-origin
 * Jamendo link is instead saved as `.html` with no controllable name.
 */
export const GET: APIRoute = async ({ params, request, clientAddress }) => {
  const jamendoId = params.jamendoId;
  if (!jamendoId) return new Response(null, { status: 400 });

  const formatParam = new URL(request.url).searchParams.get("format");
  const format = formatParam ? parseJamendoAudioFormat(formatParam) : undefined;
  const upstream = await fetchCcDownload(jamendoId, clientAddress, format);
  if (!upstream.ok) return new Response(null, { status: upstream.status });

  const headers = new Headers();
  for (const name of PASSTHROUGH_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
};
