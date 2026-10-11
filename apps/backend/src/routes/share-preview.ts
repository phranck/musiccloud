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
import type { PreviewObservation, SharePageAlbumResult, SharePageDbResult, TrackRepository } from "../db/repository.js";
import { log } from "../lib/infra/logger.js";
import { sendRateLimitError } from "../lib/infra/rate-limit-response.js";
import { apiRateLimiter, isInternalRequest } from "../lib/infra/rate-limiter.js";
import { getPreviewExpiry, isExpiredDeezerPreviewUrl } from "../lib/preview-url.js";
import { deezerAlbumIdFromLinks } from "../lib/server/share-page.js";
import { deezerAdapter } from "../services/plugins/deezer/adapter.js";

/**
 * The preview row stored for a URL just fetched from Deezer, with the expiry
 * its signature carries.
 *
 * @param url - The preview URL Deezer returned.
 * @returns The observation to upsert for the `deezer` service.
 */
function deezerPreviewObservation(url: string): PreviewObservation {
  const expiresAtMs = getPreviewExpiry(url, "deezer");
  return { service: "deezer", url, expiresAt: expiresAtMs ? new Date(expiresAtMs) : null };
}

/**
 * A usable preview URL for a track share: the stored one while its Deezer
 * signature is valid, otherwise a fresh one looked up on Deezer by ISRC and
 * stored for the next request.
 *
 * @param repo - The repository the share was read from.
 * @param data - The track share.
 * @returns The preview URL, or `null` when none can be produced.
 */
async function currentTrackPreview(repo: TrackRepository, data: SharePageDbResult): Promise<string | null> {
  const existing = data.track.previewUrl;
  if (existing && !isExpiredDeezerPreviewUrl(existing)) return existing;
  if (!data.track.isrc || !deezerAdapter.isAvailable()) return null;

  try {
    const deezerTrack = await deezerAdapter.findByIsrc(data.track.isrc);
    if (!deezerTrack?.previewUrl) return null;
    await repo.upsertTrackPreview(data.trackId, deezerPreviewObservation(deezerTrack.previewUrl));
    return deezerTrack.previewUrl;
  } catch (error) {
    log.deviation(
      {
        component: "SharePreview",
        errorCode: "MC-API-0004",
        operation: "track_preview_refresh",
        outcome: "preview_unavailable",
      },
      error,
    );
    return null;
  }
}

/**
 * A usable preview URL for an album share: the stored one while its Deezer
 * signature is valid, otherwise the top track's preview of the album its
 * Deezer link names, stored for the next request.
 *
 * @param repo - The repository the share was read from.
 * @param data - The album share.
 * @returns The preview URL, or `null` when none can be produced.
 */
async function currentAlbumPreview(repo: TrackRepository, data: SharePageAlbumResult): Promise<string | null> {
  const existing = data.album.previewUrl;
  if (existing && !isExpiredDeezerPreviewUrl(existing)) return existing;
  const deezerAlbumId = deezerAlbumIdFromLinks(data.links);
  if (!deezerAlbumId || !deezerAdapter.isAvailable()) return null;

  try {
    const deezerAlbum = await deezerAdapter.getAlbum(deezerAlbumId);
    if (!deezerAlbum.topTrackPreviewUrl) return null;
    await repo.upsertAlbumPreview(data.albumId, deezerPreviewObservation(deezerAlbum.topTrackPreviewUrl));
    return deezerAlbum.topTrackPreviewUrl;
  } catch (error) {
    log.deviation(
      {
        component: "SharePreview",
        errorCode: "MC-API-0004",
        operation: "album_preview_refresh",
        outcome: "preview_unavailable",
      },
      error,
    );
    return null;
  }
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
            shortId: {
              type: "string",
              minLength: 1,
              maxLength: 64,
              pattern: "^[A-Za-z0-9_-]+$",
              description:
                "Track or album share code: take the last path segment of `shortUrl` from a successful track or album response from `POST /api/v1/resolve` or `GET /api/v1/resolve`. Artist and Creative Commons share codes are not accepted.",
            },
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
