/**
 * @file GET `/api/v1/cc/artist-info?jamendoArtistId&artistName` — the CC artist
 * column (the artist's popular tracks + similar tracks + profile), built live
 * from Jamendo.
 *
 * Split out of the CC share/resolve response so those render the core track card
 * immediately; the share page and the live result load this async (~4 throttled
 * Jamendo calls) and fade the column in, mirroring the commercial artist-info
 * lazy-load.
 */
import { ENDPOINTS } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { publicErrorResponse } from "../docs/public-response-schema.js";
import { sendRateLimitError } from "../lib/infra/rate-limit-response.js";
import { apiRateLimiter, isInternalRequest } from "../lib/infra/rate-limiter.js";
import { buildCcTrackArtistInfo } from "../services/cc/cc-share-response.js";

export default async function ccArtistInfoRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { jamendoArtistId?: string; artistName?: string } }>(
    ENDPOINTS.v1.ccArtistInfo,
    {
      schema: {
        tags: ["CC"],
        summary: "CC artist column (Jamendo popular + similar tracks + profile)",
        description:
          "Returns the Creative-Commons artist column (popular tracks, similar tracks, profile) for a Jamendo artist, in the shared ArtistInfoResponse shape. Loaded async by the CC share page so the core card renders immediately.",
        querystring: {
          type: "object",
          required: ["jamendoArtistId", "artistName"],
          properties: {
            jamendoArtistId: { type: "string", minLength: 1, maxLength: 32, pattern: "^[0-9]+$" },
            artistName: { type: "string", minLength: 1, maxLength: 200 },
          },
          additionalProperties: false,
        },
        response: {
          200: {
            description: "Creative Commons artist metadata in the shared artist-info shape.",
            $ref: "ArtistInfo#",
          },
          400: publicErrorResponse("The Jamendo artist id or artist name is missing or malformed."),
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

      const { jamendoArtistId, artistName } = request.query;
      if (!jamendoArtistId || !artistName) {
        return reply
          .status(400)
          .send({ error: "BAD_REQUEST", message: "jamendoArtistId and artistName are required." });
      }

      const artistInfo = await buildCcTrackArtistInfo(artistName, jamendoArtistId);
      return reply.send(artistInfo);
    },
  );
}
