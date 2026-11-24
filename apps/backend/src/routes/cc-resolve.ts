/**
 * POST `/api/v1/cc/resolve` is the Creative-Commons resolve endpoint.
 *
 * Registered inside the same `authenticatePublic` scope as the commercial
 * resolve route. Flows:
 *  - `query` (free text or `title:`/`artist:`/`album:`) → disambiguation list.
 *  - `query` (`genre:`) → CC genre browse / search (sourced from Jamendo).
 *  - `selectedCandidate` → resolve + persist → `cc-track` (`jamendo:<id>`),
 *    `cc-album` (`jamendo-album:<id>`) or `cc-artist` (`jamendo-artist:<id>`).
 *  - `query` (Jamendo track, album or artist link) → resolved like the
 *    matching `selectedCandidate`.
 * Links to other streaming services and cross-service matching belong to the
 * commercial route.
 */

import type {
  CcAlbumResolveSuccessResponse,
  CcArtistResolveSuccessResponse,
  CcResolveSuccessResponse,
  ResolveDisambiguationResponse,
  ResolveRequest,
} from "@musiccloud/shared";
import { ENDPOINTS, parseJamendoLink } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { getCcRepository, getRepository } from "../db/index.js";
import { createApiErrorResponse } from "../lib/infra/api-errors.js";
import { sendRateLimitError } from "../lib/infra/rate-limit-response.js";
import { siteResolveRateLimiter } from "../lib/infra/rate-limiter.js";
import { shortUrlOrigin } from "../lib/server/allowed-origin.js";
import { shortUrlFor } from "../lib/server/short-url.js";
import { runCcGenreBrowse, runCcGenreSearch } from "../services/cc/cc-genre.js";
import { ccAlbumToPersistData, ccArtistToPersistData, ccTrackToPersistData } from "../services/cc/cc-persist-data.js";
import { ccCandidateIdForJamendoLink, resolveCcCandidate, resolveCcTextSearch } from "../services/cc/cc-resolver.js";
import { buildCcAlbumPayload, buildCcArtistPayload, toApiCcTrack } from "../services/cc/cc-share-response.js";
import type { CcAlbum, CcArtist, CcTrack } from "../services/cc/jamendo/types.js";
import { GenreQueryParseError, isGenreBrowseQuery, isGenreSearchQuery } from "../services/genre-search/index.js";
import { resolveAlbumVinylLayout, resolveTrackVinylLayout } from "../services/track-vinyl-layout.js";

export default async function ccResolveRoutes(app: FastifyInstance) {
  app.post(
    ENDPOINTS.v1.ccResolve,
    {
      schema: {
        tags: ["Resolve"],
        summary: "Resolve a Jamendo link or a Creative-Commons free-text or structured query",
        description:
          "Use `query` for a Jamendo track, album, or artist link, Creative-Commons free text, a `title:`/`artist:`/`album:` structured search, or `genre:` discovery. A Jamendo link resolves directly to a persisted `cc-track`, `cc-album`, or `cc-artist` response. Links to other streaming services are not accepted here; send them to `POST /api/v1/resolve`. A text search returns `ResolveDisambiguation`; choose one row and send its opaque `candidates[].id` back as `selectedCandidate`. A CC genre result already returns candidate IDs in `results.*[].id`; pass one unchanged as `selectedCandidate` to receive a persisted `cc-track`, `cc-album`, or `cc-artist` response.",
        security: [{ ApiKeyAuth: [] }],
        body: {
          type: "object",
          description:
            "Exactly one of `query` or `selectedCandidate` must be present. Supplying both is rejected with `400`.",
          properties: {
            query: {
              type: "string",
              minLength: 1,
              maxLength: 500,
              description:
                "A Jamendo track, album, or artist link, Creative-Commons free text, structured search beginning with `title:`, `artist:`, or `album:`, or a `genre:` discovery query. Links to other streaming services are not accepted.",
              examples: [
                "https://www.jamendo.com/track/459544",
                "ambient piano",
                "artist: Madpix, title: Moments",
                "genre: ambient, tracks: 10",
              ],
            },
            selectedCandidate: {
              type: "string",
              minLength: 1,
              maxLength: 200,
              description:
                "Opaque candidate token returned as `candidates[].id` or `results.*[].id` by this endpoint. Pass it unchanged; prefixes such as `jamendo:`, `jamendo-album:`, and `jamendo-artist:` identify the response variant.",
              example: "jamendo:123456",
            },
          } satisfies Record<keyof ResolveRequest, object>,
          oneOf: [{ required: ["query"] }, { required: ["selectedCandidate"] }],
          additionalProperties: false,
          examples: [
            { query: "https://www.jamendo.com/track/459544" },
            { query: "ambient piano" },
            { selectedCandidate: "jamendo:123456" },
          ],
        },
        response: {
          200: {
            description:
              "A `ResolveDisambiguation` selection list, a persisted `cc-track`, `cc-album`, or `cc-artist`, or a genre-discovery result with `status` equal to `genre-browse` or `genre-search`.",
            oneOf: [
              { $ref: "ResolveDisambiguation#" },
              { $ref: "CcResolveSuccess#" },
              { $ref: "CcGenreSearchResponse#" },
              { $ref: "CcGenreBrowseResponse#" },
            ],
          },
          400: {
            description:
              "The body does not contain exactly one usable `query` or `selectedCandidate`, the query syntax is invalid, or the candidate token has an unsupported format.",
            $ref: "ErrorResponse#",
          },
          401: { description: "Missing, invalid, or revoked API key.", $ref: "ErrorResponse#" },
          404: { description: "The selected candidate could not be resolved.", $ref: "ErrorResponse#" },
          429: {
            description:
              "The issued API key exceeded its assigned rolling `60`-second or rolling `24`-hour quota. Inspect `context` and `Retry-After` before retrying.",
            $ref: "ErrorResponse#",
          },
          500: {
            description: "Unexpected server error. Use `errorId` from the response when reporting the failure.",
            $ref: "ErrorResponse#",
          },
        },
      },
    },
    async (request, reply) => {
      // Per-IP limit for internal BFF callers; token-authenticated clients
      // are quota-checked centrally in authenticatePublic (MC-088).
      if (!request.apiClient) {
        const rateLimit = siteResolveRateLimiter.check(request.ip);
        if (rateLimit.limited) {
          return sendRateLimitError(reply, rateLimit);
        }
      }

      const body = request.body as ResolveRequest;
      const query = body.query?.trim();
      const selectedCandidate = body.selectedCandidate?.trim();

      if (!query && !selectedCandidate) {
        return reply.status(400).send(
          createApiErrorResponse("INVALID_URL", {
            overrideMessage: "The 'query' or 'selectedCandidate' field is required.",
          }),
        );
      }
      const origin = shortUrlOrigin(request.headers.origin);

      // CC genre discovery. Detected by the `genre:` prefix, handled
      // entirely from Jamendo (browse = `/radios`, search = `/tracks?tags=`).
      // The CC path routes ALL queries, genre included, and never uses the
      // commercial genre endpoint. Nothing is persisted here, because the
      // follow-up resolve fires when the user clicks a result.
      if (query && isGenreBrowseQuery(query)) {
        return reply.send(await runCcGenreBrowse());
      }
      if (query && isGenreSearchQuery(query)) {
        try {
          return reply.send(await runCcGenreSearch(query));
        } catch (err) {
          if (err instanceof GenreQueryParseError) {
            return reply.status(400).send(createApiErrorResponse("INVALID_URL", { overrideMessage: err.message }));
          }
          throw err;
        }
      }

      // A pasted Jamendo link names its entity exactly, so it skips the text
      // search and resolves like the candidate a disambiguation row carries.
      const jamendoLink = query ? parseJamendoLink(query) : null;
      const candidate = selectedCandidate || (jamendoLink ? ccCandidateIdForJamendoLink(jamendoLink) : undefined);

      if (candidate) {
        const resolved = await resolveCcCandidate(candidate);
        if (!resolved) {
          return reply.status(404).send(createApiErrorResponse("TRACK_NOT_FOUND"));
        }
        switch (resolved.kind) {
          case "album":
            return reply.send(await persistCcAlbumAndRespond(resolved.album, resolved.tracks, origin));
          case "artist":
            return reply.send(await persistCcArtistAndRespond(resolved.artist, resolved.topTracks, origin));
          default:
            return reply.send(await persistCcTrackAndRespond(resolved.track, origin));
        }
      }

      const { candidates } = await resolveCcTextSearch(query!);
      const disambiguation: ResolveDisambiguationResponse = { status: "disambiguation", candidates };
      return reply.send(disambiguation);
    },
  );
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
  const { ccTrackId, shortId } = await repo.persistCcTrack(ccTrackToPersistData(track));
  const vinylLayout = await resolveTrackVinylLayout(await getRepository(), {
    artists: [track.artistName],
    albumName: track.albumName,
  });

  // Core card only. The artist column loads client-side via /api/cc/artist-info.
  return {
    type: "cc-track",
    id: ccTrackId,
    shortUrl: shortUrlFor(origin, shortId),
    track: { ...toApiCcTrack(track), vinylLayout },
  };
}

/**
 * Persists a resolved CC album together with its tracklist (so the share page
 * reads it from the DB) and shapes the `cc-album` success response.
 *
 * @param album - the resolved CC album.
 * @param tracks - the album's tracks in release order.
 * @param origin - validated origin for the short URL.
 * @returns the cc-album success payload.
 */
async function persistCcAlbumAndRespond(
  album: CcAlbum,
  tracks: CcTrack[],
  origin: string,
): Promise<CcAlbumResolveSuccessResponse> {
  const repo = await getCcRepository();
  const { ccAlbumId, shortId } = await repo.persistCcAlbum(ccAlbumToPersistData(album, tracks));

  const { album: apiAlbum, artistInfo } = await buildCcAlbumPayload(album, tracks);
  const vinylLayout = await resolveAlbumVinylLayout(await getRepository(), {
    artists: [album.artistName],
    title: album.name,
  });
  return {
    type: "cc-album",
    id: ccAlbumId,
    shortUrl: shortUrlFor(origin, shortId),
    album: { ...apiAlbum, vinylLayout },
    artistInfo,
  };
}

/**
 * Persists a resolved CC artist together with its top tracks (so the share page
 * reads the column from the DB) and shapes the `cc-artist` success response.
 *
 * @param artist - the resolved CC artist.
 * @param topTracks - the artist's most-popular tracks, descending.
 * @param origin - validated origin for the short URL.
 * @returns the cc-artist success payload.
 */
async function persistCcArtistAndRespond(
  artist: CcArtist,
  topTracks: CcTrack[],
  origin: string,
): Promise<CcArtistResolveSuccessResponse> {
  const repo = await getCcRepository();
  const { ccArtistId, shortId } = await repo.persistCcArtist(ccArtistToPersistData(artist, topTracks));

  const { artist: apiArtist, artistInfo } = await buildCcArtistPayload(artist, topTracks);
  return { type: "cc-artist", id: ccArtistId, shortUrl: shortUrlFor(origin, shortId), artist: apiArtist, artistInfo };
}
