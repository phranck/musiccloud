/**
 * POST `/api/v1/cc/resolve` — Creative-Commons resolve endpoint.
 *
 * Registered inside the same `authenticatePublic` scope as the commercial
 * resolve route. Two flows only:
 *  - `query` (free text or `title:`/`artist:`/`album:`) → disambiguation list.
 *  - `selectedCandidate` (`jamendo:<id>`) → resolve + persist → `cc-track`.
 * No URL-paste, no genre, no cross-service (those are separate / out of scope).
 */

import type {
  ApiCcTrack,
  CcResolveSuccessResponse,
  ResolveDisambiguationResponse,
  ResolveErrorResponse,
} from "@musiccloud/shared";
import { ENDPOINTS, formatUserMessage, getErrorEntry } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { getCcRepository } from "../db/index.js";
import { requireEnvList } from "../lib/env.js";
import { log } from "../lib/infra/logger.js";
import { sendRateLimitError } from "../lib/infra/rate-limit-response.js";
import { apiRateLimiter } from "../lib/infra/rate-limiter.js";
import { runCcGenreBrowse, runCcGenreSearch } from "../services/cc/cc-genre.js";
import { resolveCcSelectedCandidate, resolveCcTextSearch } from "../services/cc/cc-resolver.js";
import type { CcTrack } from "../services/cc/jamendo/types.js";
import { GenreQueryParseError, isGenreBrowseQuery, isGenreSearchQuery } from "../services/genre-search/index.js";

const ALLOWED_ORIGINS = requireEnvList("ALLOWED_ORIGINS");

export default async function ccResolveRoutes(app: FastifyInstance) {
  app.post(
    ENDPOINTS.v1.ccResolve,
    {
      schema: {
        tags: ["Resolve"],
        summary: "Resolve a Creative-Commons free-text or structured query (Jamendo)",
        security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
        body: {
          type: "object",
          description: "Exactly one of `query` or `selectedCandidate` must be present.",
          properties: {
            query: { type: "string", minLength: 1, maxLength: 500 },
            selectedCandidate: { type: "string", minLength: 1, maxLength: 200 },
          },
          anyOf: [{ required: ["query"] }, { required: ["selectedCandidate"] }],
          additionalProperties: false,
        },
        response: {
          200: {
            description:
              'A CC disambiguation list, a resolved cc-track, or a CC genre-discovery result (`status: "genre-browse"` / `status: "genre-search"`, sourced from Jamendo).',
            oneOf: [
              { $ref: "ResolveDisambiguation#" },
              {
                type: "object",
                additionalProperties: true,
                description: "Resolved cc-track success payload or CC genre-browse/genre-search response.",
              },
            ],
          },
          400: { description: "Malformed body or candidate id.", $ref: "ErrorResponse#" },
          401: { description: "Missing or invalid API key / bearer token.", $ref: "ErrorResponse#" },
          404: { description: "The selected candidate could not be resolved.", $ref: "ErrorResponse#" },
          429: { description: "Rate limit exceeded for this client IP.", $ref: "ErrorResponse#" },
          500: { description: "Unexpected server error.", $ref: "ErrorResponse#" },
        },
      },
    },
    async (request, reply) => {
      const rateLimit = apiRateLimiter.check(request.ip);
      if (rateLimit.limited) {
        return sendRateLimitError(reply, rateLimit);
      }

      const body = request.body as { query?: string; selectedCandidate?: string };
      const query = body.query?.trim();
      const selectedCandidate = body.selectedCandidate?.trim();

      if (!query && !selectedCandidate) {
        return reply.status(400).send(ccError("INVALID_URL", "The 'query' or 'selectedCandidate' field is required."));
      }

      try {
        const origin = getOrigin(request.headers.origin);

        // CC genre discovery. Detected by the `genre:` prefix, handled
        // entirely from Jamendo (browse = `/radios`, search = `/tracks?tags=`).
        // The CC path routes ALL queries, genre included — never the
        // commercial genre endpoint. Non-committal: nothing is persisted here,
        // the follow-up resolve fires when the user clicks a result.
        if (query && isGenreBrowseQuery(query)) {
          return reply.send(await runCcGenreBrowse());
        }
        if (query && isGenreSearchQuery(query)) {
          try {
            return reply.send(await runCcGenreSearch(query));
          } catch (err) {
            if (err instanceof GenreQueryParseError) {
              return reply.status(400).send(ccError("INVALID_URL", err.message));
            }
            throw err;
          }
        }

        if (selectedCandidate) {
          const track = await resolveCcSelectedCandidate(selectedCandidate);
          if (!track) {
            return reply.status(404).send(ccError("TRACK_NOT_FOUND"));
          }
          return reply.send(await persistCcTrackAndRespond(track, origin));
        }

        const { candidates } = await resolveCcTextSearch(query!);
        const disambiguation: ResolveDisambiguationResponse = { status: "disambiguation", candidates };
        return reply.send(disambiguation);
      } catch (error) {
        log.error("CcResolve", "Unexpected error:", error instanceof Error ? error.message : "Unknown error");
        if (process.env.NODE_ENV !== "production" && error instanceof Error) {
          log.error("CcResolve", "Stack:", error.stack);
        }
        return reply.status(500).send(ccError("NETWORK_ERROR"));
      }
    },
  );
}

/**
 * Picks a whitelisted origin for the minted short URL.
 *
 * @param headerOrigin - raw `Origin` header.
 * @returns a whitelisted origin string.
 */
function getOrigin(headerOrigin?: string): string {
  if (headerOrigin && ALLOWED_ORIGINS.includes(headerOrigin)) {
    return headerOrigin;
  }
  return ALLOWED_ORIGINS[0];
}

/**
 * Builds the wire-format error payload (same shape as the commercial route).
 *
 * @param code - error code from the shared table.
 * @param overrideMessage - optional message override.
 * @returns the error response body.
 */
function ccError(code: string, overrideMessage?: string): ResolveErrorResponse {
  const entry = getErrorEntry(code);
  return { error: entry.code, message: formatUserMessage(entry.code, undefined, overrideMessage) };
}

/**
 * Persists a resolved CC track and shapes the `cc-track` success response.
 *
 * @param track - the resolved CC track.
 * @param origin - validated origin for the short URL.
 * @returns the cc-track success payload.
 */
async function persistCcTrackAndRespond(track: CcTrack, origin: string): Promise<CcResolveSuccessResponse> {
  const repo = await getCcRepository();
  const { ccTrackId, shortId } = await repo.persistCcTrack({
    jamendoId: track.jamendoId,
    title: track.title,
    artistName: track.artistName,
    jamendoArtistId: track.jamendoArtistId,
    albumName: track.albumName,
    jamendoAlbumId: track.jamendoAlbumId,
    artworkUrl: track.artworkUrl,
    durationMs: track.durationMs,
    releaseDate: track.releaseDate,
    licenseCcurl: track.licenseCcurl,
    streamUrl: track.streamUrl,
    downloadUrl: track.downloadUrl,
    downloadAllowed: track.downloadAllowed,
    waveform: track.waveform,
    shareUrl: track.shareUrl,
  });

  const apiTrack: ApiCcTrack = {
    jamendoId: track.jamendoId,
    title: track.title,
    artistName: track.artistName,
    albumName: track.albumName,
    artworkUrl: track.artworkUrl,
    durationMs: track.durationMs,
    releaseDate: track.releaseDate,
    licenseCcurl: track.licenseCcurl,
    streamUrl: track.streamUrl,
    downloadUrl: track.downloadUrl,
    downloadAllowed: track.downloadAllowed,
    waveform: track.waveform,
    shareUrl: track.shareUrl,
  };

  return { type: "cc-track", id: ccTrackId, shortUrl: `${origin}/${shortId}`, track: apiTrack };
}
