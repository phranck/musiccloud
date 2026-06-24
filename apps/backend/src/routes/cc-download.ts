/**
 * @file GET `/api/v1/cc/download/:jamendoId` — same-origin download proxy for a
 * Creative-Commons track.
 *
 * Jamendo's download URL is cross-origin, so a browser ignores the `download`
 * attribute on a link pointing at it and instead navigates to Jamendo's download
 * page — which it saves as a `.html` file, with no control over the name. This
 * proxy re-serves the track's audio from our own origin as an attachment with a
 * `Content-Disposition` filename (`Artist_Album_NN_Title.ext`), so the browser
 * saves a correctly named audio file. It reuses the permanent Jamendo stream URL
 * (the same source the audio player streams) rather than the download page.
 */

import { Readable } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";
import {
  buildCcDownloadFilename,
  JAMENDO_FORMAT_META,
  parseJamendoAudioFormat,
  ROUTE_TEMPLATES,
  swapStreamFormat,
} from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { log } from "../lib/infra/logger.js";
import { sendRateLimitError } from "../lib/infra/rate-limit-response.js";
import { apiRateLimiter, isInternalRequest } from "../lib/infra/rate-limiter.js";
import { getCcTrack } from "../services/cc/jamendo/client.js";

/**
 * Builds the `Content-Disposition` header value for a download: a plain ASCII
 * fallback `filename=` (non-ASCII replaced) plus the RFC 5987 `filename*=` UTF-8
 * form, so names with umlauts/accents survive in modern browsers and degrade
 * gracefully in old ones.
 *
 * @param filename - The desired (possibly non-ASCII) filename.
 * @returns The full `Content-Disposition` header value.
 */
function contentDisposition(filename: string): string {
  const asciiFallback = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/**
 * Registers the CC-download proxy route. Resolves the track by Jamendo id, then
 * streams its audio back as a named attachment in the requested format.
 *
 * @param app - The Fastify instance to register on.
 */
export default async function ccDownloadRoutes(app: FastifyInstance) {
  app.get<{ Params: { jamendoId: string }; Querystring: { format?: string } }>(
    ROUTE_TEMPLATES.v1.ccDownload,
    {
      schema: {
        tags: ["CC"],
        summary: "Download a CC track as a correctly named audio file",
        description:
          "Re-serves a Creative-Commons track's audio from our own origin as an attachment with a Content-Disposition filename (Artist_Album_NN_Title.ext), so the browser saves a properly named audio file instead of Jamendo's cross-origin download page. The optional `?format=` query selects the delivery format (mp31 | mp32 | ogg | flac); an invalid or absent value falls back to mp32.",
        params: {
          type: "object",
          required: ["jamendoId"],
          properties: {
            jamendoId: { type: "string", minLength: 1, maxLength: 32, pattern: "^[0-9]+$" },
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

      const track = await getCcTrack(jamendoId);
      if (!track?.streamUrl) {
        return reply.status(404).send({ error: "TRACK_NOT_FOUND", message: "No CC track found for this Jamendo id." });
      }
      if (!track.downloadAllowed) {
        return reply.status(403).send({ error: "DOWNLOAD_NOT_ALLOWED", message: "This track is not downloadable." });
      }

      let upstream: Response;
      try {
        upstream = await fetch(swapStreamFormat(track.streamUrl, format));
      } catch (err) {
        log.debug("CcDownload", "Jamendo audio fetch failed:", err instanceof Error ? err.message : String(err));
        return reply.status(502).send({ error: "UPSTREAM_UNAVAILABLE", message: "Could not reach the audio." });
      }
      if (!upstream.ok || !upstream.body) {
        return reply.status(502).send({ error: "UPSTREAM_ERROR", message: "The audio is unavailable." });
      }

      const filename = buildCcDownloadFilename({
        artist: track.artistName,
        album: track.albumName,
        trackNumber: track.albumPosition,
        title: track.title,
        format,
      });

      reply.header("Content-Type", JAMENDO_FORMAT_META[format].mime);
      reply.header("Content-Disposition", contentDisposition(filename));
      const length = upstream.headers.get("content-length");
      if (length) reply.header("Content-Length", length);
      reply.header("Cache-Control", "no-store");

      return reply.send(Readable.fromWeb(upstream.body as NodeWebReadableStream<Uint8Array>));
    },
  );
}
