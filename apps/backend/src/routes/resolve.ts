/**
 * @file POST `/api/v1/resolve` - full-feature authenticated resolve endpoint.
 *
 * Registered inside the `authenticatePublic` scope in `server.ts`, so the
 * request has already presented an X-API-Key (frontend BFF) or a Bearer
 * JWT (external API client). See `resolve-public-get.ts` for the
 * unauthenticated GET companion used by curl / Apple Shortcuts.
 *
 * This POST endpoint carries two capabilities the GET endpoint does not:
 *
 * 1. **Disambiguation.** When a text search turns up multiple plausible
 *    matches, it returns a `ResolveDisambiguationResponse` with a list of
 *    candidates. The client then issues a follow-up POST with
 *    `selectedCandidate` set to the chosen candidate string, which enters
 *    Flow 1 below and completes the resolve.
 * 2. **Multi-kind routing.** URLs are classified into track, album, or
 *    artist and dispatched to the matching resolver, producing a
 *    `UnifiedResolveSuccessResponse` discriminated on `type`.
 *
 * ## Three flows
 *
 * The handler branches on what the body contains:
 *
 * - **Flow 1** (`selectedCandidate` present): the client is completing a
 *   disambiguation round from a previous call. Tracks only, because
 *   text-search-based disambiguation only ever fires for tracks.
 * - **Flow 2** (`query` is a URL): short links (`link.deezer.com/s/...`)
 *   are expanded, the canonical URL is classified, and the matching
 *   resolver runs (album / artist / default track).
 * - **Flow 3** (`query` is free text): text search with disambiguation.
 *   A single clear match resolves immediately; multiple matches return
 *   the disambiguation list (no DB persistence at that point - nothing
 *   to persist until the user picks).
 *
 * ## URL cleaning order
 *
 * Flow 2 strips tracking params twice:
 *
 * 1. Before `expandShortLink`: the user-pasted URL itself may carry
 *    `utm_*` etc.; stripping first gives us a clean canonical short link.
 * 2. After `expandShortLink`: the short-link target frequently injects
 *    fresh tracking params into the redirect URL, so the expanded form
 *    needs another pass.
 *
 * Skipping either pass leaves tracking junk in either the DB or the
 * response, which breaks cache identity (same track, different URL).
 *
 * ## 500-character query cap, 200-character candidate cap
 *
 * Same rationale as in `resolve-public-get.ts`: the cap is there so that
 * pathological inputs cannot reach the FTS5 text search. The selected
 * candidate is a shorter serialized identifier, hence the tighter limit.
 */
import type {
  ResolveDisambiguationResponse,
  ResolveErrorResponse,
  UnifiedResolveSuccessResponse,
} from "@musiccloud/shared";
import { ENDPOINTS, formatUserMessage, getErrorEntry } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { getRepository } from "../db/index.js";
import { log } from "../lib/infra/logger.js";
import { apiRateLimiter } from "../lib/infra/rate-limiter.js";
import { isAlbumUrl, isArtistUrl, isUrl, stripTrackingParams } from "../lib/platform/url.js";
import { getPreviewExpiry } from "../lib/preview-url.js";
import { ResolveError } from "../lib/resolve/errors.js";
import { buildCodeSamples } from "../schemas/openapi-code-samples.js";
import type { AlbumResolutionResult } from "../services/album-resolver.js";
import { resolveAlbumUrl } from "../services/album-resolver.js";
import type { ArtistResolutionResult } from "../services/artist-resolver.js";
import { resolveArtistUrl } from "../services/artist-resolver.js";
import {
  GenreQueryParseError,
  isGenreBrowseQuery,
  isGenreSearchQuery,
  NoGenreSearchAdapterError,
  runGenreBrowse,
  runGenreSearch,
} from "../services/genre-search/index.js";
import { persistResolution } from "../services/persist-resolution.js";
import type { ResolutionResult } from "../services/resolver.js";
import {
  expandShortLink,
  resolveQuery,
  resolveSelectedCandidate,
  resolveTextSearchWithDisambiguation,
} from "../services/resolver.js";

/**
 * Same whitelist as in `routes/resolve-public-get.ts`; the full rationale
 * lives there. Kept in sync between the two files manually.
 */
const ALLOWED_ORIGINS = [
  "https://musiccloud.io",
  "http://localhost:3000",
  "http://localhost:4321",
  "http://localhost:4322",
];

export default async function resolveRoutes(app: FastifyInstance) {
  app.post(
    ENDPOINTS.v1.resolve,
    {
      schema: {
        tags: ["Resolve"],
        summary: "Resolve a music URL, free-text query, or genre-discovery query",
        "x-codeSamples": buildCodeSamples({
          method: "POST",
          path: "/api/v1/resolve",
          auth: "bearer",
          body: { query: "https://open.spotify.com/track/2WfaOiMkCvy7F5fcp2zZ8L" },
        }),
        description:
          "Accepts one of three query shapes:\n" +
          "1. A streaming-service URL (e.g. `https://open.spotify.com/track/...`) — returns unified cross-service metadata.\n" +
          "2. A free-text query — returns either a resolved match or a disambiguation list (follow up with `selectedCandidate` to complete).\n" +
          "3. A genre-discovery query starting with `genre:` (e.g. `genre: jazz|r&b, tracks: 20, vibe: mixed`) — returns up to three parallel candidate lists (tracks, albums, artists) sourced from Deezer's chart API. Supported fields: `genre` (required, `|` = OR), `tracks`/`albums`/`artists` (1–50), `count` (1–50, shorthand for the same count across all three types; mutually exclusive with the per-type fields), `vibe` (`hot` or `mixed`).",
        security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
        body: {
          type: "object",
          description:
            "Exactly one of `query` or `selectedCandidate` must be present. `query` is a URL or search string; `selectedCandidate` completes a prior disambiguation round.",
          properties: {
            query: {
              type: "string",
              minLength: 1,
              maxLength: 500,
              description: "Streaming-service URL or free-text search string.",
            },
            selectedCandidate: {
              type: "string",
              minLength: 1,
              maxLength: 200,
              description: "Identifier of a candidate returned by a previous disambiguation response.",
            },
          },
          anyOf: [{ required: ["query"] }, { required: ["selectedCandidate"] }],
          additionalProperties: false,
        },
        response: {
          200: {
            description:
              'Success. Either a resolved track/album/artist (`UnifiedResolveSuccess`, discriminated by `type`), a disambiguation list (`ResolveDisambiguation`, `status: "disambiguation"`), or a genre-discovery result (`status: "genre-search"` / `status: "genre-browse"` — see description).',
            oneOf: [
              { $ref: "UnifiedResolveSuccess#" },
              { $ref: "ResolveDisambiguation#" },
              {
                type: "object",
                additionalProperties: true,
                description: "Genre-search or genre-browse response (see endpoint description).",
              },
            ],
          },
          400: { description: "Invalid URL, invalid genre query, or malformed body.", $ref: "ErrorResponse#" },
          401: { description: "Missing or invalid API key / bearer token.", $ref: "ErrorResponse#" },
          404: { description: "URL is valid but the track/album/artist could not be found.", $ref: "ErrorResponse#" },
          408: { description: "Upstream service timed out before a match could be confirmed.", $ref: "ErrorResponse#" },
          429: { description: "Rate limit exceeded for this client IP (10/min).", $ref: "ErrorResponse#" },
          500: { description: "Unexpected server error.", $ref: "ErrorResponse#" },
          503: {
            description: "Required upstream service (e.g. the Deezer genre adapter) is unavailable.",
            $ref: "ErrorResponse#",
          },
        },
      },
    },
    async (request, reply) => {
      // Rate limiting
      const clientIp = request.ip;
      if (apiRateLimiter.isLimited(clientIp)) {
        return reply.status(429).send(jsonError("RATE_LIMITED"));
      }

      // Schema guarantees the object shape and length caps; we still trim
      // so downstream code never sees pure-whitespace input treated as valid.
      const body = request.body as { query?: string; selectedCandidate?: string };
      const query = body.query?.trim();
      const selectedCandidate = body.selectedCandidate?.trim();

      if (!query && !selectedCandidate) {
        return reply
          .status(400)
          .send(jsonError("INVALID_URL", "The 'query' or 'selectedCandidate' field is required."));
      }

      try {
        const origin = getOrigin(request.headers.origin);

        // Flow 0: genre-based discovery search. Detected by the `genre:`
        // prefix on the trimmed query. Returns its own discriminated
        // response variant, does not persist anything (discovery is
        // non-committal — the follow-up resolve happens when the user
        // clicks a result).
        if (query && isGenreBrowseQuery(query)) {
          try {
            const browseResponse = await runGenreBrowse();
            return reply.send(browseResponse);
          } catch (err) {
            if (err instanceof NoGenreSearchAdapterError) {
              return reply.status(503).send(jsonError("SERVICE_DOWN", err.message));
            }
            throw err;
          }
        }

        if (query && isGenreSearchQuery(query)) {
          try {
            const genreResponse = await runGenreSearch(query);
            return reply.send(genreResponse);
          } catch (err) {
            if (err instanceof GenreQueryParseError) {
              return reply.status(400).send(jsonError("INVALID_URL", err.message));
            }
            if (err instanceof NoGenreSearchAdapterError) {
              return reply.status(503).send(jsonError("SERVICE_DOWN", err.message));
            }
            log.error("GenreSearch", err instanceof Error ? err.message : "Unknown error");
            if (process.env.NODE_ENV !== "production" && err instanceof Error) {
              log.error("GenreSearch", "Stack:", err.stack);
            }
            return reply.status(503).send(jsonError("SERVICE_DOWN"));
          }
        }

        if (selectedCandidate) {
          // Flow 1: completing a previous disambiguation. The candidate
          // string came from the client's earlier disambiguation response,
          // so no input classification is needed here.
          const result = await resolveSelectedCandidate(selectedCandidate);
          return reply.send(await persistTrackAndRespond(result, origin));
        }

        if (isUrl(query!)) {
          // Flow 2. See the file header for why `stripTrackingParams` runs
          // on both sides of `expandShortLink`.
          const expanded = await expandShortLink(stripTrackingParams(query!));
          const cleanUrl = stripTrackingParams(expanded);

          // Content-type routing. The order (album -> artist -> track) is
          // a negative-check chain: `isAlbumUrl` / `isArtistUrl` match
          // specific URL shapes per service; anything that falls through
          // is treated as a track URL, which is the common case.
          if (isAlbumUrl(cleanUrl)) {
            const result = await resolveAlbumUrl(cleanUrl);
            return reply.send(await persistAlbumAndRespond(result, origin));
          }
          if (isArtistUrl(cleanUrl)) {
            const result = await resolveArtistUrl(cleanUrl);
            return reply.send(await persistArtistAndRespond(result, origin));
          }
          const result = await resolveQuery(query!);
          return reply.send(await persistTrackAndRespond(result, origin));
        }

        // Flow 3: free-text search. Unlike the GET endpoint, we can return
        // candidates back to an interactive client and wait for Flow 1.
        const textResult = await resolveTextSearchWithDisambiguation(query!);

        if (textResult.kind === "resolved" && textResult.result) {
          return reply.send(await persistTrackAndRespond(textResult.result, origin));
        }

        // Disambiguation branch: do NOT persist anything. Writing a track
        // here would create a DB row we cannot safely associate with any of
        // the candidates; the commit happens in the Flow 1 follow-up when
        // the client tells us which candidate was picked.
        const disambiguationBody: ResolveDisambiguationResponse = {
          status: "disambiguation",
          candidates: textResult.candidates ?? [],
        };
        return reply.send(disambiguationBody);
      } catch (error) {
        if (error instanceof ResolveError) {
          // httpStatus is `number` in the error registry; the schema declares
          // every code the registry can actually emit (400/401/404/408/429/500/503),
          // so the cast is safe at runtime.
          const httpStatus = getErrorEntry(error.code).httpStatus as 400 | 401 | 404 | 408 | 429 | 500 | 503;
          return reply.status(httpStatus).send(jsonError(error.code, error.message || undefined, error.context));
        }

        log.error("Resolve", "Unexpected error:", error instanceof Error ? error.message : "Unknown error");
        if (process.env.NODE_ENV !== "production" && error instanceof Error) {
          log.error("Resolve", "Stack:", error.stack);
        }
        return reply.status(500).send(jsonError("NETWORK_ERROR"));
      }
    },
  );
}

/**
 * Picks a safe origin for the short URL embedded in the response. Same
 * shape and motivation as the helper in `routes/resolve-public-get.ts`.
 *
 * @param headerOrigin - raw `Origin` header value from the incoming request
 * @returns a whitelisted origin string
 */
function getOrigin(headerOrigin?: string): string {
  if (headerOrigin && ALLOWED_ORIGINS.includes(headerOrigin)) {
    return headerOrigin;
  }
  return ALLOWED_ORIGINS[0];
}

/**
 * Builds the wire-format error payload. `code` may be either an MC code
 * or a legacy code: `getErrorEntry` resolves both and the response always
 * carries the canonical MC code along with a user-facing message that
 * includes the code as a grep-friendly suffix.
 *
 * @param code            - error code (MC or legacy) from the shared table
 * @param overrideMessage - optional caller-specific message replacing the template output
 * @param context         - values interpolated into the message template when no override is given
 * @returns `ResolveErrorResponse` ready to send as the JSON body
 */
function jsonError(
  code: string,
  overrideMessage?: string,
  context?: Record<string, string | number>,
): ResolveErrorResponse {
  const entry = getErrorEntry(code);
  return {
    error: entry.code,
    message: formatUserMessage(entry.code, context, overrideMessage),
  };
}

/**
 * Persists a track resolve result, opportunistically refreshes a stale
 * Deezer preview, and shapes the unified success response. The logic is
 * identical to `persistAndRespond` in `routes/resolve-public-get.ts`
 * (track branch); see that file for the full rationale on the
 * `inputUrl` alias write, the Deezer preview refresh, and the
 * double-stripping of tracking params.
 *
 * @param result - resolver output (source track + cross-service links)
 * @param origin - already-validated origin used to mint the short URL
 * @returns unified success payload with `type: "track"`
 */
async function persistTrackAndRespond(
  result: ResolutionResult,
  origin: string,
): Promise<UnifiedResolveSuccessResponse> {
  const { trackId, shortId, refreshedPreviewUrl } = await persistResolution(result);
  const shortUrl = `${origin}/${shortId}`;

  return {
    type: "track",
    id: trackId,
    shortUrl,
    track: {
      title: result.sourceTrack.title,
      artists: result.sourceTrack.artists,
      albumName: result.sourceTrack.albumName,
      artworkUrl: result.sourceTrack.artworkUrl,
      durationMs: result.sourceTrack.durationMs,
      isrc: result.sourceTrack.isrc,
      releaseDate: result.sourceTrack.releaseDate,
      isExplicit: result.sourceTrack.isExplicit,
      previewUrl: refreshedPreviewUrl,
    },
    links: result.links.map((l) => ({
      service: l.service,
      displayName: l.displayName,
      url: stripTrackingParams(l.url),
      confidence: l.confidence,
      matchMethod: l.matchMethod,
    })),
  };
}

/**
 * Persists an album resolve result and shapes the unified success response.
 *
 * Album payloads carry `previewUrl` pointing at the album's lead-off
 * track preview, because the frontend renders an inline player on the
 * album share page. The album resolver may or may not have populated
 * `topTrackPreviewUrl` (depends on the source service); if the source
 * left it empty, this function looks through the resolved cross-service
 * links for a Deezer entry that does have a preview URL. Deezer is the
 * fallback of choice because it is keyless and has broad preview
 * coverage.
 *
 * Unlike tracks, there is no inline staleness check here: the fallback
 * writes whatever Deezer served into the DB, and a later refresh of the
 * individual track rows will pick up any expired signed URLs.
 *
 * @param result - album resolver output (source album + cross-service links)
 * @param origin - already-validated origin used to mint the short URL
 * @returns unified success payload with `type: "album"`
 */
async function persistAlbumAndRespond(
  result: AlbumResolutionResult,
  origin: string,
): Promise<UnifiedResolveSuccessResponse> {
  const repo = await getRepository();

  let previewUrl = result.sourceAlbum.topTrackPreviewUrl;
  let previewService: string | null = previewUrl ? (result.sourceAlbum.sourceService ?? null) : null;
  if (!previewUrl) {
    const deezerLink = result.links.find((l) => l.service === "deezer" && l.topTrackPreviewUrl);
    if (deezerLink?.topTrackPreviewUrl) {
      previewUrl = deezerLink.topTrackPreviewUrl;
      previewService = "deezer";
    }
  }

  const { albumId, shortId } = await repo.persistAlbumWithLinks({
    sourceAlbum: {
      ...result.sourceAlbum,
      sourceUrl: result.sourceAlbum.webUrl,
      previewUrl,
    },
    links: result.links.map((l) => ({
      service: l.service,
      url: stripTrackingParams(l.url),
      confidence: l.confidence,
      matchMethod: l.matchMethod,
      externalId: l.externalId,
    })),
  });

  // Persist the resolved album preview into `album_previews`. The
  // canonical `albums` row no longer carries a preview column; reads
  // pull the best preview from `album_previews` via subquery.
  if (previewUrl && previewService) {
    const expiresAtMs = getPreviewExpiry(previewUrl, previewService);
    try {
      await repo.upsertAlbumPreview(albumId, {
        service: previewService,
        url: previewUrl,
        expiresAt: expiresAtMs ? new Date(expiresAtMs) : null,
      });
    } catch (err) {
      log.debug("Resolve", "Album preview persist failed:", err instanceof Error ? err.message : String(err));
    }
  }

  if (result.externalIds.length > 0) {
    try {
      await repo.addAlbumExternalIds(albumId, result.externalIds);
    } catch (err) {
      log.debug("Resolve", "Album external-id persist failed:", err instanceof Error ? err.message : String(err));
    }
  }

  const shortUrl = `${origin}/${shortId}`;

  return {
    type: "album",
    id: albumId,
    shortUrl,
    album: {
      title: result.sourceAlbum.title,
      artists: result.sourceAlbum.artists,
      releaseDate: result.sourceAlbum.releaseDate,
      totalTracks: result.sourceAlbum.totalTracks,
      artworkUrl: result.sourceAlbum.artworkUrl,
      label: result.sourceAlbum.label,
      upc: result.sourceAlbum.upc,
      previewUrl,
    },
    links: result.links.map((l) => ({
      service: l.service,
      displayName: l.displayName,
      url: stripTrackingParams(l.url),
      confidence: l.confidence,
      matchMethod: l.matchMethod,
    })),
  };
}

/**
 * Persists an artist resolve result and shapes the unified success response.
 *
 * Unlike track and album, the artist payload has no `previewUrl` - an
 * artist is not a playable unit, so there is no Deezer refresh path and
 * no preview-URL threading.
 *
 * @param result - artist resolver output (source artist + cross-service links)
 * @param origin - already-validated origin used to mint the short URL
 * @returns unified success payload with `type: "artist"`
 */
async function persistArtistAndRespond(
  result: ArtistResolutionResult,
  origin: string,
): Promise<UnifiedResolveSuccessResponse> {
  const repo = await getRepository();

  const { artistId, shortId } = await repo.persistArtistWithLinks({
    sourceArtist: {
      ...result.sourceArtist,
      sourceUrl: result.sourceArtist.webUrl,
    },
    links: result.links.map((l) => ({
      service: l.service,
      url: stripTrackingParams(l.url),
      confidence: l.confidence,
      matchMethod: l.matchMethod,
      externalId: l.externalId,
    })),
  });

  if (result.externalIds.length > 0) {
    try {
      await repo.addArtistExternalIds(artistId, result.externalIds);
    } catch (err) {
      log.debug("Resolve", "Artist external-id persist failed:", err instanceof Error ? err.message : String(err));
    }
  }

  const shortUrl = `${origin}/${shortId}`;

  return {
    type: "artist",
    id: artistId,
    shortUrl,
    artist: {
      name: result.sourceArtist.name,
      imageUrl: result.sourceArtist.imageUrl,
      genres: result.sourceArtist.genres,
    },
    links: result.links.map((l) => ({
      service: l.service,
      displayName: l.displayName,
      url: stripTrackingParams(l.url),
      confidence: l.confidence,
      matchMethod: l.matchMethod,
    })),
  };
}
