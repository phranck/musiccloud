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
import { buildCodeSamples } from "../schemas/openapi-code-samples.js";

export default async function linkRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>(
    ROUTE_TEMPLATES.v1.link,
    {
      schema: {
        tags: ["Links"],
        summary: "Fetch link metadata for a previously-resolved track",
        "x-codeSamples": buildCodeSamples({
          method: "GET",
          path: "/api/v1/link/tr_01HZ8N2B6P7Q8W9E3R4T5Y6U7I",
          auth: "bearer",
        }),
        description:
          "Slim, cache-friendly read against an already-persisted track. No external adapter calls. Use this when you already hold the track id (e.g. from a prior resolve) and just want the service links for rendering.",
        security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: {
              type: "string",
              minLength: 1,
              maxLength: 64,
              description: "Internal track id returned by a previous resolve.",
            },
          },
          additionalProperties: false,
        },
        response: {
          200: {
            description: "Track core metadata and resolved service links (same shape as a successful resolve).",
            type: "object",
            required: ["id", "track", "links"],
            additionalProperties: false,
            properties: {
              id: { type: "string", description: "The internal track id echoed back." },
              track: { $ref: "Track#" },
              links: { type: "array", items: { $ref: "PlatformLink#" } },
            },
          },
          401: { description: "Missing or invalid API key / bearer token.", $ref: "ErrorResponse#" },
          404: { description: "No track exists for this id.", $ref: "ErrorResponse#" },
          429: { description: "Rate limit exceeded for this client IP.", $ref: "ErrorResponse#" },
        },
      },
    },
    async (request, reply) => {
      const clientIp = request.ip;
      if (apiRateLimiter.isLimited(clientIp)) {
        return reply.status(429).send({
          error: "RATE_LIMITED",
          message: "Too many requests. Please try again later.",
        });
      }

      const { id } = request.params;

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
    },
  );
}
