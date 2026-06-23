export const prerender = false;

import { parseJamendoAudioFormat } from "@musiccloud/shared";
import type { APIRoute } from "astro";
import { fetchCcAudio } from "@/api/client";

/** Upstream headers relayed verbatim so the `<audio>` element can range-seek. */
const PASSTHROUGH_HEADERS = ["content-type", "content-length", "content-range", "accept-ranges", "cache-control"];

/**
 * Thin streaming proxy: forwards GET (with the visitor's `Range` header) to the
 * backend `/api/v1/cc/audio/:jamendoId` and relays the audio stream back from
 * the same origin. This lets the player's `<audio crossorigin="anonymous">`
 * load CC tracks — Jamendo's storage server omits the Range CORS headers the
 * Web-Audio analyser needs, but here the request never leaves our origin.
 */
export const GET: APIRoute = async ({ params, request, clientAddress }) => {
  const jamendoId = params.jamendoId;
  if (!jamendoId) return new Response(null, { status: 400 });

  const formatParam = new URL(request.url).searchParams.get("format");
  const format = formatParam ? parseJamendoAudioFormat(formatParam) : undefined;
  const upstream = await fetchCcAudio(jamendoId, request.headers.get("range"), clientAddress, format);
  if (!upstream.ok && upstream.status !== 206) return new Response(null, { status: upstream.status });

  const headers = new Headers();
  for (const name of PASSTHROUGH_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
};
