/**
 * @file GET `/api/v1/cc/audio/:jamendoId` — CORS-safe proxy for the full
 * Jamendo audio stream of a Creative-Commons track.
 *
 * Jamendo's storage server does not answer the CORS Range preflight the way
 * Deezer's CDN does (no `Access-Control-Allow-Headers: Range`), so a cross-
 * origin `<audio crossorigin="anonymous">` — which the player needs for the
 * Web-Audio spectrum analyser — fails to load Jamendo audio. The frontend
 * therefore loads CC audio through this proxy (via the same-origin Astro
 * forward), which re-serves the stream with proper Range semantics from our
 * own origin.
 *
 * The track's stream URL is resolved by Jamendo id and cached in-process (the
 * Jamendo stream URL is permanent), so the many Range requests a single
 * playback fans out into do not each hit the Jamendo API.
 */

import { Readable } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import { ROUTE_TEMPLATES } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { log } from "../lib/infra/logger.js";
import { sendRateLimitError } from "../lib/infra/rate-limit-response.js";
import { apiRateLimiter, isInternalRequest } from "../lib/infra/rate-limiter.js";
import { getCcTrack } from "../services/cc/jamendo/client.js";

/** Jamendo stream URLs are permanent full-track links, so a long TTL keeps the
 *  Range requests of one playback from re-querying the API per request. */
const STREAM_URL_TTL_MS = 60 * 60 * 1000;
const streamUrlCache = new Map<string, { url: string; expiresAt: number }>();

/** Upstream response headers worth forwarding verbatim to the client. */
const FORWARDED_HEADERS = ["content-type", "content-length", "content-range", "cache-control"] as const;

/**
 * Resolves a CC track's permanent Jamendo stream URL by Jamendo id, caching the
 * result in-process so repeated Range requests do not each call Jamendo.
 *
 * @param jamendoId - The Jamendo track id.
 * @returns The stream URL, or `null` when Jamendo has no such track.
 */
async function resolveStreamUrl(jamendoId: string): Promise<string | null> {
  const cached = streamUrlCache.get(jamendoId);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  const track = await getCcTrack(jamendoId);
  if (!track?.streamUrl) return null;
  streamUrlCache.set(jamendoId, { url: track.streamUrl, expiresAt: Date.now() + STREAM_URL_TTL_MS });
  return track.streamUrl;
}

/**
 * Registers the CC-audio proxy route. Streams the Jamendo audio for a track id
 * through our origin, forwarding the client's `Range` header and the upstream
 * status (200 / 206) + content headers, and advertising `Accept-Ranges` so the
 * `<audio>` element can seek.
 *
 * @param app - The Fastify instance to register on.
 */
export default async function ccAudioRoutes(app: FastifyInstance) {
  app.get<{ Params: { jamendoId: string } }>(
    ROUTE_TEMPLATES.v1.ccAudio,
    {
      schema: {
        tags: ["CC"],
        summary: "Proxy the full Jamendo audio stream for a CC track",
        description:
          "Re-serves the permanent Jamendo stream for a Creative-Commons track from our own origin, forwarding Range requests, so the audio player can load and analyse it without Jamendo's missing Range CORS headers.",
        params: {
          type: "object",
          required: ["jamendoId"],
          properties: {
            jamendoId: { type: "string", minLength: 1, maxLength: 32, pattern: "^[0-9]+$" },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      if (!isInternalRequest(request)) {
        const rateLimit = apiRateLimiter.check(request.ip);
        if (rateLimit.limited) {
          return sendRateLimitError(reply, rateLimit);
        }
      }

      const { jamendoId } = request.params;
      const streamUrl = await resolveStreamUrl(jamendoId);
      if (!streamUrl) {
        return reply.status(404).send({ error: "TRACK_NOT_FOUND", message: "No CC track found for this Jamendo id." });
      }

      const range = request.headers.range;
      let upstream: Response;
      try {
        upstream = await fetch(streamUrl, { headers: range ? { Range: range } : {} });
      } catch (err) {
        log.debug("CcAudio", "Jamendo stream fetch failed:", err instanceof Error ? err.message : String(err));
        return reply.status(502).send({ error: "UPSTREAM_UNAVAILABLE", message: "Could not reach the audio stream." });
      }

      if (!upstream.ok && upstream.status !== 206) {
        return reply.status(502).send({ error: "UPSTREAM_ERROR", message: "The audio stream is unavailable." });
      }
      if (!upstream.body) {
        return reply.status(502).send({ error: "UPSTREAM_EMPTY", message: "The audio stream returned no body." });
      }

      reply.status(upstream.status);
      reply.header("Accept-Ranges", "bytes");
      for (const name of FORWARDED_HEADERS) {
        const value = upstream.headers.get(name);
        if (value) reply.header(name, value);
      }
      if (!upstream.headers.get("content-type")) reply.header("Content-Type", "audio/mpeg");

      return reply.send(Readable.fromWeb(upstream.body as NodeWebReadableStream<Uint8Array>));
    },
  );
}
