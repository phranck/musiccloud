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
import {
  JAMENDO_FORMAT_META,
  type JamendoAudioFormat,
  parseJamendoAudioFormat,
  ROUTE_TEMPLATES,
  swapStreamFormat,
} from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { publicErrorResponse } from "../docs/public-response-schema.js";
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
 * Resolves a CC track's permanent Jamendo stream URL by Jamendo id and rewrites
 * it to the requested format.
 *
 * The cache holds the format-agnostic base URL (Jamendo returns it with its own
 * default format); the requested `format` is applied per request via
 * {@link swapStreamFormat}, so a single cache entry serves every format and
 * repeated Range requests never re-call Jamendo.
 *
 * @param jamendoId - The Jamendo track id.
 * @param format - The desired delivery format.
 * @returns The format-rewritten stream URL, or `null` when Jamendo has no such track.
 */
async function resolveStreamUrl(jamendoId: string, format: JamendoAudioFormat): Promise<string | null> {
  const cached = streamUrlCache.get(jamendoId);
  let baseUrl: string;
  if (cached && cached.expiresAt > Date.now()) {
    baseUrl = cached.url;
  } else {
    const track = await getCcTrack(jamendoId);
    if (!track?.streamUrl) return null;
    baseUrl = track.streamUrl;
    streamUrlCache.set(jamendoId, { url: baseUrl, expiresAt: Date.now() + STREAM_URL_TTL_MS });
  }
  return swapStreamFormat(baseUrl, format);
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
  app.get<{ Params: { jamendoId: string }; Querystring: { format?: string } }>(
    ROUTE_TEMPLATES.v1.ccAudio,
    {
      schema: {
        tags: ["CC"],
        summary: "Proxy the full Jamendo audio stream for a CC track",
        description:
          "Re-serves the permanent Jamendo stream for a Creative-Commons track from our own origin, forwarding Range requests, so the audio player can load and analyse it without Jamendo's missing Range CORS headers. The optional `?format=` query selects the delivery format (mp31 | mp32 | ogg | flac); an invalid or absent value falls back to mp32.",
        params: {
          type: "object",
          required: ["jamendoId"],
          properties: {
            jamendoId: {
              type: "string",
              minLength: 1,
              maxLength: 32,
              pattern: "^[0-9]+$",
              description:
                "Numeric Jamendo track ID. Read `track.jamendoId` from a `cc-track` result or an item in `album.tracks` or `artist.topTracks` from `POST /api/v1/cc/resolve`.",
            },
          },
          additionalProperties: false,
        },
        querystring: {
          type: "object",
          properties: {
            format: { type: "string", description: "Jamendo delivery format (mp31 | mp32 | ogg | flac)." },
          },
          additionalProperties: false,
        },
        response: {
          200: {
            description: "Complete Creative Commons audio stream.",
            type: "string",
            format: "binary",
          },
          206: {
            description: "Requested byte range of the Creative Commons audio stream.",
            type: "string",
            format: "binary",
          },
          400: publicErrorResponse("The Jamendo track id is malformed."),
          404: publicErrorResponse("No Creative Commons track exists for this Jamendo id."),
          502: publicErrorResponse("The upstream Jamendo audio stream is unavailable or returned no body."),
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
      const format = parseJamendoAudioFormat(request.query.format);
      const streamUrl = await resolveStreamUrl(jamendoId, format);
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
      if (!upstream.headers.get("content-type")) reply.header("Content-Type", JAMENDO_FORMAT_META[format].mime);

      return reply.send(Readable.fromWeb(upstream.body as NodeWebReadableStream<Uint8Array>));
    },
  );
}
