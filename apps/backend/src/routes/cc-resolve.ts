/**
 * POST `/api/v1/cc/resolve` — Creative-Commons resolve endpoint.
 *
 * Registered inside the same `authenticatePublic` scope as the commercial
 * resolve route. Flows:
 *  - `query` (free text or `title:`/`artist:`/`album:`) → disambiguation list.
 *  - `query` (`genre:`) → CC genre browse / search (sourced from Jamendo).
 *  - `selectedCandidate` → resolve + persist → `cc-track` (`jamendo:<id>`),
 *    `cc-album` (`jamendo-album:<id>`) or `cc-artist` (`jamendo-artist:<id>`).
 * No URL-paste, no cross-service (those are separate / out of scope).
 */

import type {
  CcAlbumResolveSuccessResponse,
  CcArtistResolveSuccessResponse,
  CcResolveSuccessResponse,
  ResolveDisambiguationResponse,
} from "@musiccloud/shared";
import { ENDPOINTS } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { getCcRepository, getRepository } from "../db/index.js";
import { requireEnvList } from "../lib/env.js";
import { createApiErrorResponse } from "../lib/infra/api-errors.js";
import { sendRateLimitError } from "../lib/infra/rate-limit-response.js";
import { apiRateLimiter } from "../lib/infra/rate-limiter.js";
import { runCcGenreBrowse, runCcGenreSearch } from "../services/cc/cc-genre.js";
import { resolveCcCandidate, resolveCcTextSearch } from "../services/cc/cc-resolver.js";
import {
  buildCcAlbumPayload,
  buildCcArtistPayload,
  ccTrackToPersistData,
  toApiCcTrack,
} from "../services/cc/cc-share-response.js";
import type { CcAlbum, CcArtist, CcTrack } from "../services/cc/jamendo/types.js";
import { GenreQueryParseError, isGenreBrowseQuery, isGenreSearchQuery } from "../services/genre-search/index.js";
import { resolveAlbumVinylLayout, resolveTrackVinylLayout } from "../services/track-vinyl-layout.js";

const ALLOWED_ORIGINS = requireEnvList("ALLOWED_ORIGINS");

export default async function ccResolveRoutes(app: FastifyInstance) {
  app.post(
    ENDPOINTS.v1.ccResolve,
    {
      schema: {
        tags: ["Resolve"],
        summary: "Resolve a Creative-Commons free-text or structured query (Jamendo)",
        security: [{ ApiKeyAuth: [] }],
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
              'A CC disambiguation list, a resolved cc-track / cc-album / cc-artist, or a CC genre-discovery result (`status: "genre-browse"` / `status: "genre-search"`, sourced from Jamendo).',
            oneOf: [
              { $ref: "ResolveDisambiguation#" },
              { $ref: "CcResolveSuccess#" },
              { $ref: "GenreSearchResponse#" },
              { $ref: "GenreBrowseResponse#" },
            ],
          },
          400: { description: "Malformed body or candidate id.", $ref: "ErrorResponse#" },
          401: { description: "Missing, invalid, or revoked API key.", $ref: "ErrorResponse#" },
          404: { description: "The selected candidate could not be resolved.", $ref: "ErrorResponse#" },
          429: { description: "Rate limit exceeded for this client IP.", $ref: "ErrorResponse#" },
          500: { description: "Unexpected server error.", $ref: "ErrorResponse#" },
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

      const body = request.body as { query?: string; selectedCandidate?: string };
      const query = body.query?.trim();
      const selectedCandidate = body.selectedCandidate?.trim();

      if (!query && !selectedCandidate) {
        return reply.status(400).send(ccError("INVALID_URL", "The 'query' or 'selectedCandidate' field is required."));
      }
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
        const resolved = await resolveCcCandidate(selectedCandidate);
        if (!resolved) {
          return reply.status(404).send(ccError("TRACK_NOT_FOUND"));
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
function ccError(code: string, overrideMessage?: string) {
  return createApiErrorResponse(code, { overrideMessage });
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

  // Core card only — the artist column loads client-side via /api/cc/artist-info.
  return {
    type: "cc-track",
    id: ccTrackId,
    shortUrl: `${origin}/${shortId}`,
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
  const { ccAlbumId, shortId } = await repo.persistCcAlbum({
    jamendoId: album.jamendoId,
    name: album.name,
    jamendoArtistId: album.jamendoArtistId,
    artistName: album.artistName,
    artworkUrl: album.artworkUrl,
    releaseDate: album.releaseDate,
    zipUrl: album.zipUrl,
    shareUrl: album.shareUrl,
    // 1-based release-order position from the array index (Jamendo returns the
    // tracklist in release order) so the share page reads it back in order.
    tracks: tracks.map((track, i) => ({ ...ccTrackToPersistData(track), albumPosition: i + 1 })),
  });

  const { album: apiAlbum, artistInfo } = await buildCcAlbumPayload(album, tracks);
  const vinylLayout = await resolveAlbumVinylLayout(await getRepository(), {
    artists: [album.artistName],
    title: album.name,
  });
  return {
    type: "cc-album",
    id: ccAlbumId,
    shortUrl: `${origin}/${shortId}`,
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
  const { ccArtistId, shortId } = await repo.persistCcArtist({
    jamendoId: artist.jamendoId,
    name: artist.name,
    imageUrl: artist.imageUrl,
    website: artist.website,
    shareUrl: artist.shareUrl,
    // 0-based popularity rank from the array index (Jamendo returns the tracks in
    // popularity order) so the share page reads the column back in rank order.
    topTracks: topTracks.map((track, i) => ({ ...ccTrackToPersistData(track), artistTopPosition: i })),
  });

  const { artist: apiArtist, artistInfo } = await buildCcArtistPayload(artist, topTracks);
  return { type: "cc-artist", id: ccArtistId, shortUrl: `${origin}/${shortId}`, artist: apiArtist, artistInfo };
}
