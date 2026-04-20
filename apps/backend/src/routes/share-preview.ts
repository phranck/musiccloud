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
import { isExpiredDeezerPreviewUrl } from "../lib/preview-url.js";
import { deezerAdapter } from "../services/plugins/deezer/adapter.js";

export default async function sharePreviewRoutes(app: FastifyInstance) {
  app.get<{ Params: { shortId: string } }>(
    ROUTE_TEMPLATES.v1.sharePreview,
    {
      schema: {
        tags: ["Share"],
        summary: "Refresh the audio preview URL for a share",
        description:
          "Looks the track up by short ID, refreshes its Deezer preview URL via ISRC if missing or expired, persists the refreshed URL, and returns it. Returns `previewUrl: null` when no preview can be produced (no ISRC or Deezer unavailable).",
        params: {
          type: "object",
          required: ["shortId"],
          properties: {
            shortId: {
              type: "string",
              minLength: 1,
              maxLength: 64,
              pattern: "^[A-Za-z0-9_-]+$",
            },
          },
          additionalProperties: false,
        },
        response: {
          200: {
            type: "object",
            required: ["previewUrl"],
            properties: {
              previewUrl: { type: ["string", "null"] },
            },
            additionalProperties: false,
          },
          404: { $ref: "ErrorResponse#" },
        },
      },
    },
    async (request, reply) => {
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
          await repo.updatePreviewUrl(data.trackId, deezerTrack.previewUrl);
          return reply.send({ previewUrl: deezerTrack.previewUrl });
        }
      } catch (err) {
        log.debug("SharePreview", "Deezer preview refresh failed:", err instanceof Error ? err.message : String(err));
      }

      return reply.send({ previewUrl: null });
    },
  );
}
