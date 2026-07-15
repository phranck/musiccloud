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
        summary: "Stream a full Creative Commons track",
        description:
          "Returns the selected full-track representation as raw audio bytes, not JSON. For ordinary browser playback, point an `<audio>` element directly at the endpoint:\n\n" +
          '```html\n<audio controls src="https://api.musiccloud.io/api/v1/cc/audio/123456?format=mp32"></audio>\n```\n\n' +
          "For `fetch`, consume `response.body` as a byte stream or call `response.blob()`; do not call `response.json()`. A `Blob` is available only after the complete response has been buffered, so use streaming or a direct `<audio>` URL for long tracks.\n\n" +
          "**Formats.** `format=mp31` selects MP3 at `96 kbps`; `format=mp32` selects MP3 at approximately `256 kbps`; `format=ogg` selects Ogg Vorbis; and `format=flac` selects lossless FLAC. The default is `mp32`. The response `Content-Type` identifies the actual representation.\n\n" +
          "**Seeking and resumable reads.** Send a valid HTTP range such as `Range: bytes=0-1048575` or `Range: bytes=-1048576`. A satisfiable range returns `206` and `Content-Range`; a complete representation returns `200`. `Accept-Ranges` is always `bytes`. `Content-Length` and `Cache-Control` are included only when supplied for the selected representation.",
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
                "Numeric Jamendo track ID. Read `track.jamendoId`, `album.tracks[].jamendoId`, or `artist.topTracks[].jamendoId` from a successful `POST /api/v1/cc/resolve` or `GET /api/v1/share/{shortId}` response.",
            },
          },
          additionalProperties: false,
        },
        querystring: {
          type: "object",
          properties: {
            format: {
              type: "string",
              default: "mp32",
              description:
                "Jamendo delivery format: `mp31` (MP3 96 kbps), `mp32` (MP3 about 256 kbps), `ogg`, or `flac`. Invalid values also fall back to `mp32`.\n\n**Default**: `mp32`.",
            },
          },
          additionalProperties: false,
        },
        headers: {
          type: "object",
          properties: {
            range: {
              type: "string",
              pattern: "^bytes=(?:[0-9]+-[0-9]*|-[0-9]+)$",
              description: "Optional HTTP byte range, for example `bytes=0-1048575`. Omit it for the complete stream.",
            },
          },
          additionalProperties: true,
        },
        response: {
          200: {
            description: "Complete full raw audio stream when no byte range was requested.",
            headers: {
              "Accept-Ranges": { type: "string", enum: ["bytes"], description: "Always `bytes`." },
              "Content-Length": {
                type: "integer",
                minimum: 0,
                description:
                  "Complete representation size in bytes. The header is omitted when the size is unavailable.",
              },
              "Cache-Control": {
                type: "string",
                description:
                  "Cache policy for the selected audio representation. The header is omitted when no policy is available.",
              },
            },
            content: {
              "audio/mpeg": { schema: { type: "string", format: "binary" } },
              "audio/ogg": { schema: { type: "string", format: "binary" } },
              "audio/flac": { schema: { type: "string", format: "binary" } },
            },
          },
          206: {
            description: "Requested raw-audio byte range. `Content-Range` identifies the delivered segment.",
            headers: {
              "Accept-Ranges": { type: "string", enum: ["bytes"], description: "Always `bytes`." },
              "Content-Range": {
                type: "string",
                description: "Delivered byte interval and complete size, for example `bytes 0-1048575/7340032`.",
              },
              "Content-Length": {
                type: "integer",
                minimum: 0,
                description: "Delivered range size in bytes. The header is omitted when the size is unavailable.",
              },
              "Cache-Control": {
                type: "string",
                description:
                  "Cache policy for the selected audio representation. The header is omitted when no policy is available.",
              },
            },
            content: {
              "audio/mpeg": { schema: { type: "string", format: "binary" } },
              "audio/ogg": { schema: { type: "string", format: "binary" } },
              "audio/flac": { schema: { type: "string", format: "binary" } },
            },
          },
          400: publicErrorResponse(
            "`jamendoId` is not numeric or `Range` does not use a supported single-byte-range syntax.",
          ),
          404: publicErrorResponse("No Creative Commons track exists for this `jamendoId`."),
          502: publicErrorResponse("The upstream Jamendo audio stream is unavailable or returned no body."),
          429: publicErrorResponse("This client IP exceeded `10` requests in a rolling `60`-second window."),
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

      if (upstream.status !== 200 && upstream.status !== 206) {
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
