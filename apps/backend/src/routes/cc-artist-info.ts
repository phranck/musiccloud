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
        summary: "Get Creative Commons artist details and related tracks",
        description:
          "Returns `CcArtistInfo` for one Jamendo artist: up to `20` popular tracks in descending popularity order, a profile or `null`, up to `12` tracks by related artists, and an always-empty `events` array. Candidate values in `topTracks[].deezerUrl` and `similarArtistTracks[].track.deezerUrl` are opaque `jamendo:<trackId>` tokens, not URLs. Pass one unchanged as `selectedCandidate` to `POST /api/v1/cc/resolve` to persist and resolve that track.",
        querystring: {
          type: "object",
          required: ["jamendoArtistId", "artistName"],
          properties: {
            jamendoArtistId: {
              type: "string",
              minLength: 1,
              maxLength: 32,
              pattern: "^[0-9]+$",
              description:
                "Numeric Jamendo artist ID. Read `track.jamendoArtistId`, `album.tracks[].jamendoArtistId`, or `artist.jamendoId` from a successful `POST /api/v1/cc/resolve` or `GET /api/v1/share/{shortId}` response.",
            },
            artistName: {
              type: "string",
              minLength: 1,
              maxLength: 200,
              description:
                "Display label for the artist identified by `jamendoArtistId`. Read it from `track.artistName`, `album.artistName`, or `artist.name` in the same response as the ID. The ID, not this name, controls which Jamendo artist, profile, and tracks are fetched; the supplied string is returned as `artistName`.",
            },
          },
          additionalProperties: false,
        },
        response: {
          200: {
            description: "`CcArtistInfo` derived from the requested Jamendo artist.",
            $ref: "CcArtistInfo#",
          },
          400: publicErrorResponse("`jamendoArtistId` is not numeric, or `artistName` is missing or empty."),
          429: publicErrorResponse("This client IP exceeded `10` requests in a rolling `60`-second window."),
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
