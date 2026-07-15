/**
 * @file GET `/api/v1/share/:shortId/preview` — refresh + return a fresh
 * Deezer preview URL for a share.
 *
 * Split out from the main share endpoint so the SSR hot path stays bounded
 * by database latency alone. This endpoint performs the Deezer ISRC lookup
 * and persists the refreshed URL; the frontend calls it lazily from the
 * audio player once the share page is visible and the player mounts with
 * `previewRefreshable = true`.
 *
 * Returns `{ previewUrl: null }` (not 404) when the track exists but no
 * preview is available — lets the client show a clean "No preview" state
 * without an error log.
 */
import { ROUTE_TEMPLATES } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { getRepository } from "../db/index.js";
import { log } from "../lib/infra/logger.js";
import { sendRateLimitError } from "../lib/infra/rate-limit-response.js";
import { apiRateLimiter, isInternalRequest } from "../lib/infra/rate-limiter.js";
import { getPreviewExpiry, isExpiredDeezerPreviewUrl } from "../lib/preview-url.js";
import { deezerAdapter } from "../services/plugins/deezer/adapter.js";

export default async function sharePreviewRoutes(app: FastifyInstance) {
  app.get<{ Params: { shortId: string } }>(
    ROUTE_TEMPLATES.v1.sharePreview,
    {
      schema: {
        tags: ["Share"],
        summary: "Refresh the audio preview URL for a share",
        description:
          "Returns a currently usable audio-preview URL for a commercial track share. The key `previewUrl` is always included: its value is a URL when one is available, or `null` when the track has no source identifier or no preview can be obtained. This endpoint does not accept album, artist, or Creative-Commons share codes.",
        params: {
          type: "object",
          required: ["shortId"],
          properties: {
            shortId: {
              type: "string",
              minLength: 1,
              maxLength: 64,
              pattern: "^[A-Za-z0-9_-]+$",
              description:
                "Track share code: take the last path segment of `shortUrl` from a successful track response from `POST /api/v1/resolve` or `GET /api/v1/resolve`. Album, artist, and Creative Commons share codes are not accepted.",
            },
          },
          additionalProperties: false,
        },
        response: {
          200: {
            description: "Fresh preview URL for the commercial track share, or `null` when no preview is available.",
            $ref: "SharePreviewResponse#",
          },
          404: {
            description: "No commercial track exists for this share code.",
            $ref: "ErrorResponse#",
          },
          429: {
            description: "This client IP exceeded `10` requests in a rolling `60`-second window.",
            $ref: "ErrorResponse#",
          },
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

      const { shortId } = request.params;
      const repo = await getRepository();
      const data = await repo.loadByShortId(shortId);
      if (!data) {
        return reply.status(404).send({ error: "TRACK_NOT_FOUND", message: "No track found for this short ID." });
      }

      const existing = data.track.previewUrl;
      const existingValid = !!existing && !isExpiredDeezerPreviewUrl(existing);
      if (existingValid) {
        return reply.send({ previewUrl: existing });
      }

      if (!data.track.isrc || !deezerAdapter.isAvailable()) {
        return reply.send({ previewUrl: null });
      }

      try {
        const deezerTrack = await deezerAdapter.findByIsrc(data.track.isrc);
        if (deezerTrack?.previewUrl) {
          const expiresAtMs = getPreviewExpiry(deezerTrack.previewUrl, "deezer");
          await repo.upsertTrackPreview(data.trackId, {
            service: "deezer",
            url: deezerTrack.previewUrl,
            expiresAt: expiresAtMs ? new Date(expiresAtMs) : null,
          });
          return reply.send({ previewUrl: deezerTrack.previewUrl });
        }
      } catch (err) {
        log.debug("SharePreview", "Deezer preview refresh failed:", err instanceof Error ? err.message : String(err));
      }

      return reply.send({ previewUrl: null });
    },
  );
}
