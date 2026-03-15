import type { SharePageResponse } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { loadAlbumByShortId, loadByShortId } from "../lib/server/share-page.js";

export default async function shareRoutes(app: FastifyInstance) {
  app.get<{ Params: { shortId: string } }>("/api/v1/share/:shortId", async (request, reply) => {
    const { shortId } = request.params;

    if (!shortId) {
      return reply.status(400).send({ error: "INVALID_URL", message: "Short ID is required." });
    }

    const origin = request.headers["x-forwarded-host"] ? `https://${request.headers["x-forwarded-host"]}` : undefined;

    // Try track first
    const trackData = await loadByShortId(shortId, origin);
    if (trackData) {
      const response: SharePageResponse = {
        type: "track",
        og: {
          title: trackData.og.ogTitle,
          description: trackData.og.ogDescription,
          image: trackData.og.ogImageUrl,
          url: trackData.og.ogUrl,
        },
        track: {
          title: trackData.track.title,
          artists: trackData.artists,
          albumName: trackData.track.albumName ?? undefined,
          artworkUrl: trackData.track.artworkUrl ?? undefined,
          durationMs: trackData.track.durationMs ?? undefined,
          isrc: trackData.track.isrc ?? undefined,
          releaseDate: trackData.track.releaseDate ?? undefined,
          isExplicit: trackData.track.isExplicit ?? undefined,
          previewUrl: trackData.track.previewUrl ?? undefined,
        },
        links: trackData.links.map((l) => ({
          service: l.service,
          displayName: l.service,
          url: l.url,
          confidence: 1,
          matchMethod: "cache" as const,
        })),
        shortUrl: trackData.og.ogUrl,
      };

      reply.header("Cache-Control", "private, max-age=3600");
      return reply.send(response);
    }

    // Try album
    const albumData = await loadAlbumByShortId(shortId, origin);
    if (albumData) {
      const response: SharePageResponse = {
        type: "album",
        og: {
          title: albumData.og.ogTitle,
          description: albumData.og.ogDescription,
          image: albumData.og.ogImageUrl,
          url: albumData.og.ogUrl,
        },
        album: {
          title: albumData.album.title,
          artists: albumData.artists,
          releaseDate: albumData.album.releaseDate ?? undefined,
          totalTracks: albumData.album.totalTracks ?? undefined,
          artworkUrl: albumData.album.artworkUrl ?? undefined,
          label: albumData.album.label ?? undefined,
          upc: albumData.album.upc ?? undefined,
          previewUrl: albumData.album.previewUrl ?? undefined,
        },
        links: albumData.links.map((l) => ({
          service: l.service,
          displayName: l.service,
          url: l.url,
          confidence: 1,
          matchMethod: "cache" as const,
        })),
        shortUrl: albumData.og.ogUrl,
      };

      reply.header("Cache-Control", "private, max-age=3600");
      return reply.send(response);
    }

    return reply.status(404).send({
      error: "TRACK_NOT_FOUND",
      message: "No track or album found for this short ID.",
    });
  });
}
