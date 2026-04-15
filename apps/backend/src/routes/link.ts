/**
 * @file GET `/api/v1/link/:id` - metadata lookup for a previously resolved track.
 *
 * Registered inside the `authenticatePublic` scope in `server.ts`, so the
 * request is already credentialed (X-API-Key from the BFF proxy or a Bearer
 * JWT from an external API client) by the time this handler runs. The IP
 * rate limiter layered on top is intentional defense in depth: a leaked API
 * key or a stolen JWT would otherwise allow unbounded scraping against the
 * full catalog, and the rate limiter caps the blast radius.
 *
 * Purpose contrasted with `routes/resolve.ts`: resolve performs the full
 * cross-service lookup and may talk to external adapters; this endpoint is
 * a pure DB read for an already-persisted track. Consumers that already
 * hold an ID (e.g. an iOS share extension opening a previously saved track)
 * use this to render the row without re-running the resolver.
 *
 * The response is deliberately slimmer than the resolve payload:
 * `confidence`, `matchMethod`, and `displayName` are omitted because they
 * are artefacts of the resolve decision and irrelevant once the track is
 * stored. Consumers that render the chips locally keep their own display
 * name map.
 *
 * `Cache-Control: public, max-age=3600`: track links are effectively
 * immutable after resolve (preview URL refresh is the only moving part,
 * handled in the resolve path), so a one-hour CDN cache is safe and
 * significantly cuts repeated reads.
 */
import { ROUTE_TEMPLATES } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { getRepository } from "../db/index.js";
import { apiRateLimiter } from "../lib/infra/rate-limiter.js";

export default async function linkRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>(ROUTE_TEMPLATES.v1.link, async (request, reply) => {
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
