import type { FastifyInstance } from "fastify";
import { getRepository } from "../db/index.js";
import { apiRateLimiter } from "../lib/infra/rate-limiter.js";

export default async function linkRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>("/api/v1/link/:id", async (request, reply) => {
    const clientIp = request.ip;
    if (apiRateLimiter.isLimited(clientIp)) {
      return reply.status(429).send({
        error: "RATE_LIMITED",
        message: "Too many requests. Please try again later.",
      });
    }

    const { id } = request.params;

    if (!id) {
      return reply.status(400).send({
        error: "INVALID_URL",
        message: "Track ID is required.",
      });
    }

    const repo = await getRepository();
    const data = await repo.loadByTrackId(id);

    if (!data) {
      return reply.status(404).send({
        error: "TRACK_NOT_FOUND",
        message: "Track not found.",
      });
    }

    reply.header("Cache-Control", "public, max-age=3600");
    return reply.send({
      id,
      track: {
        title: data.track.title,
        artists: data.artists,
        albumName: data.track.albumName,
        artworkUrl: data.track.artworkUrl,
      },
      links: data.links.map((l) => ({
        service: l.service,
        url: l.url,
      })),
    });
  });
}
