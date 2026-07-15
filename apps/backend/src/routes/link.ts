/**
 * @file GET `/api/v1/link/:id` - metadata lookup for a previously resolved track.
 *
 * Registered inside the `authenticatePublic` scope in `server.ts`, so the
 * request is already credentialed with X-API-Key by the time this handler runs. The IP
 * rate limiter layered on top is intentional defense in depth: a leaked API
 * key would otherwise allow unbounded scraping against the full catalog,
 * and the rate limiter caps the blast radius.
 *
 * Purpose contrasted with `routes/resolve.ts`: resolve performs the full
 * cross-service lookup and may talk to external adapters; this endpoint is
 * a pure DB read for an already-persisted track. Consumers that already
 * hold an ID (e.g. an iOS share extension opening a previously saved track)
 * use this to render the row without re-running the resolver.
 *
 * The endpoint is a DB read, but its links still use the same public
 * `PlatformLink` contract as resolve/share responses. Cache-backed link
 * reads therefore hydrate canonical display names centrally and report
 * `confidence: 1`, `matchMethod: "cache"` rather than leaking the original
 * resolver metadata stored with the row.
 *
 * `Cache-Control: public, max-age=3600`: track links are effectively
 * immutable after resolve (preview URL refresh is the only moving part,
 * handled in the resolve path), so a one-hour CDN cache is safe and
 * significantly cuts repeated reads.
 */
import { ROUTE_TEMPLATES } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { getRepository } from "../db/index.js";
import { sendRateLimitError } from "../lib/infra/rate-limit-response.js";
import { apiRateLimiter } from "../lib/infra/rate-limiter.js";
import { toCachedApiLinks } from "../lib/server/api-links.js";
import { buildCodeSamples } from "../schemas/openapi-code-samples.js";
import { readCachedAlbumVinylLayout } from "../services/track-vinyl-layout.js";

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
          auth: "apiKey",
        }),
        description:
          "Returns stored metadata and service links for a track that has already been resolved. Use it when you have the top-level `id` from a successful track response and do not need to run another resolve. Because this operation reads stored links, each `links[]` item has `matchMethod` equal to `cache` and `confidence` equal to `1`; these values do not reproduce the original resolve's matching score.",
        security: [{ ApiKeyAuth: [] }],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: {
              type: "string",
              minLength: 1,
              maxLength: 64,
              description:
                "Persisted musiccloud track ID from the top-level `id` field of a successful track response from `POST /api/v1/resolve` or `GET /api/v1/resolve` with `format=json`.",
            },
          },
          additionalProperties: false,
        },
        response: {
          200: {
            description: "`LinkMetadataResponse` with stored track metadata and service links.",
            headers: {
              "Cache-Control": {
                type: "string",
                enum: ["public, max-age=3600"],
                description: "Always `public, max-age=3600`.",
              },
            },
            $ref: "LinkMetadataResponse#",
          },
          401: { description: "Missing, invalid, or revoked API key.", $ref: "ErrorResponse#" },
          404: { description: "No track exists for this `id`.", $ref: "ErrorResponse#" },
          429: {
            description:
              "The issued API key exceeded its assigned rolling `60`-second or rolling `24`-hour quota. Inspect `context` and `Retry-After` before retrying.",
            $ref: "ErrorResponse#",
          },
        },
      },
    },
    async (request, reply) => {
      // Per-IP limit for internal BFF callers; token-authenticated clients
      // are quota-checked centrally in authenticatePublic (MC-088).
      if (!request.apiClient) {
        const rateLimit = apiRateLimiter.check(request.ip);
        if (rateLimit.limited) {
          return sendRateLimitError(reply, rateLimit);
        }
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

      const vinylLayout = data.track.albumName
        ? await readCachedAlbumVinylLayout(repo, { artists: data.artists, title: data.track.albumName })
        : null;

      reply.header("Cache-Control", "public, max-age=3600");
      return reply.send({
        id,
        track: {
          title: data.track.title,
          artists: data.artists,
          ...(data.track.albumName == null ? {} : { albumName: data.track.albumName }),
          ...(data.track.artworkUrl == null ? {} : { artworkUrl: data.track.artworkUrl }),
          vinylLayout,
        },
        links: toCachedApiLinks(data.links),
      });
    },
  );
}
