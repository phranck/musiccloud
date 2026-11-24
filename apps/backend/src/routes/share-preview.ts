/**
 * @file GET `/api/v1/share/:shortId/preview` refreshes and returns a fresh
 * Deezer preview URL for a track or album share.
 *
 * Split out from the main share endpoint so the SSR hot path stays bounded
 * by database latency alone. This endpoint asks Deezer for a fresh preview
 * and persists it; the frontend calls it lazily from the audio player once
 * the share page is visible and the player mounts with
 * `previewRefreshable = true`.
 *
 * It answers `{ previewUrl: null }` rather than 404 when the track or album
 * exists but no preview is available, so the client can show a clean
 * "No preview" state without an error log.
 */
import { ROUTE_TEMPLATES } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { getRepository } from "../db/index.js";
import type { SharePageAlbumResult, SharePageDbResult, TrackRepository } from "../db/repository.js";
import { shareCodeSchema } from "../docs/public-response-schema.js";
import { sendRateLimitError } from "../lib/infra/rate-limit-response.js";
import { apiRateLimiter, isInternalRequest } from "../lib/infra/rate-limiter.js";
import { isExpiredPreviewUrl } from "../lib/preview-url.js";
import { refreshAlbumPreview, refreshTrackPreview } from "../services/preview-refresh.js";

/**
 * A usable preview URL for a track share: the stored one while its signature
 * is valid, otherwise a fresh one from {@link refreshTrackPreview}.
 *
 * @param repo - The repository the share was read from.
 * @param data - The track share.
 * @returns The preview URL, or `null` when none can be produced.
 */
async function currentTrackPreview(repo: TrackRepository, data: SharePageDbResult): Promise<string | null> {
  const existing = data.track.previewUrl;
  if (existing && !isExpiredPreviewUrl(existing)) return existing;
  return refreshTrackPreview(repo, {
    trackId: data.trackId,
    isrc: data.track.isrc,
    title: data.track.title,
    artists: data.artists,
    durationMs: data.track.durationMs,
    links: data.links,
  });
}

/**
 * A usable preview URL for an album share: the stored one while its signature
 * is valid, otherwise a fresh one from {@link refreshAlbumPreview}.
 *
 * @param repo - The repository the share was read from.
 * @param data - The album share.
 * @returns The preview URL, or `null` when none can be produced.
 */
async function currentAlbumPreview(repo: TrackRepository, data: SharePageAlbumResult): Promise<string | null> {
  const existing = data.album.previewUrl;
  if (existing && !isExpiredPreviewUrl(existing)) return existing;
  return refreshAlbumPreview(repo, data.albumId, data.links);
}

export default async function sharePreviewRoutes(app: FastifyInstance) {
  app.get<{ Params: { shortId: string } }>(
    ROUTE_TEMPLATES.v1.sharePreview,
    {
      schema: {
        tags: ["Share"],
        summary: "Refresh the audio preview URL for a share",
        description:
          "Returns a currently usable audio-preview URL for a commercial track or album share. The key `previewUrl` is always included: its value is a URL when one is available, or `null` when no preview can be obtained, for instance because the track has no source identifier or the album has no Deezer link. This endpoint does not accept artist or Creative-Commons share codes.",
        params: {
          type: "object",
          required: ["shortId"],
          properties: {
            shortId: shareCodeSchema(
              "Track or album share code: take the last path segment of `shortUrl` from a successful track or album response from `POST /api/v1/resolve` or `GET /api/v1/resolve`. Artist and Creative Commons share codes are not accepted.",
            ),
          },
          additionalProperties: false,
        },
        response: {
          200: {
            description:
              "Fresh preview URL for the commercial track or album share, or `null` when no preview is available.",
            $ref: "SharePreviewResponse#",
          },
          404: {
            description: "No commercial track or album exists for this share code.",
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

      const track = await repo.loadByShortId(shortId);
      if (track) return reply.send({ previewUrl: await currentTrackPreview(repo, track) });

      const album = await repo.loadAlbumByShortId(shortId);
      if (album) return reply.send({ previewUrl: await currentAlbumPreview(repo, album) });

      return reply
        .status(404)
        .send({ error: "TRACK_NOT_FOUND", message: "No track or album found for this short ID." });
    },
  );
}
