/**
 * @file POST `/api/v1/resolve` - full-feature authenticated resolve endpoint.
 *
 * Registered inside the `authenticatePublic` scope in `server.ts`, so the
 * request has already presented an X-API-Key. See `resolve-public-get.ts`
 * for the unauthenticated GET companion used by curl / Apple Shortcuts.
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
 * - **Flow 2** (`query` is a URL): `resolveUrlAndRespond` expands short
 *   links (`link.deezer.com/s/...`), classifies the canonical URL, and runs
 *   the matching resolver (album / artist / default track).
 * - **Flow 3** (`query` is free text): text search with disambiguation.
 *   A single clear match resolves immediately; multiple matches return
 *   the disambiguation list (no DB persistence at that point - nothing
 *   to persist until the user picks).
 *
 * ## 500-character query cap, 200-character candidate cap
 *
 * Same rationale as in `resolve-public-get.ts`: the cap is there so that
 * pathological inputs cannot reach the FTS5 text search. The selected
 * candidate is a shorter serialized identifier, hence the tighter limit.
 */
import type { ResolveDisambiguationResponse, ResolveRequest } from "@musiccloud/shared";
import { ENDPOINTS } from "@musiccloud/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import { STRUCTURED_SEARCH_OPENAPI_SECTION, STRUCTURED_SEARCH_POST_OPENAPI_NOTE } from "../docs/resolve-openapi.js";
import { createApiErrorResponse, sendResolveError } from "../lib/infra/api-errors.js";
import { log } from "../lib/infra/logger.js";
import { sendRateLimitError } from "../lib/infra/rate-limit-response.js";
import { siteResolveRateLimiter } from "../lib/infra/rate-limiter.js";
import { isUrl } from "../lib/platform/url.js";
import { ResolveError } from "../lib/resolve/errors.js";
import { shortUrlOrigin } from "../lib/server/allowed-origin.js";
import { buildCodeSamples } from "../schemas/openapi-code-samples.js";
import {
  GenreQueryParseError,
  isGenreBrowseQuery,
  isGenreSearchQuery,
  NoGenreSearchAdapterError,
  runGenreBrowse,
  runGenreSearch,
} from "../services/genre-search/index.js";
import { persistTrackAndRespond, resolveUrlAndRespond } from "../services/resolve-response.js";
import { resolveSelectedCandidate, resolveTextSearchWithDisambiguation } from "../services/resolver.js";
import { isStructuredSearchQuery, parseStructuredQueryOrReply } from "../services/structured-search/index.js";

export default async function resolveRoutes(app: FastifyInstance) {
  app.post(
    ENDPOINTS.v1.resolve,
    {
      schema: {
        tags: ["Resolve"],
        summary: "Resolve a music URL, free-text query, genre-discovery query, or structured search query",
        "x-codeSamples": buildCodeSamples({
          method: "POST",
          path: "/api/v1/resolve",
          auth: "apiKey",
          body: { query: "https://open.spotify.com/track/2WfaOiMkCvy7F5fcp2zZ8L" },
        }),
        description:
          "Accepts four query shapes. Pick the one that matches what the user knows:\n\n" +
          "**1. Streaming-service URL** — e.g. `https://open.spotify.com/track/...`, `https://music.apple.com/...`. Returns unified cross-service metadata. Use when the user already has a link.\n\n" +
          "**2. Free-text query** — any string that is not a URL and does not start with a structured prefix. Returns a resolved match or a disambiguation list (follow up with `selectedCandidate` to pick one). Use when the user only knows roughly what they want.\n\n" +
          "**3. Genre-discovery query** — starts with `genre:`. Two sub-modes:\n" +
          "  - `genre: ?` → browse grid of popular genres (no other fields allowed).\n" +
          "  - `genre: <name>[|<name>...]<, modifier>*` → discovery results. Modifiers: `tracks`/`albums`/`artists` (`1`–`50` each, default `10` of each when none is specified), `count` (`1`–`50`, sets all three to the same value, mutually exclusive with per-type modifiers), `vibe` (`hot` for the highest-ranked results, `mixed` for a stratified sample across the ranked pool). `|` inside a value means OR.\n" +
          "  - Example: `genre: jazz|r&b, tracks: 20, vibe: mixed`.\n\n" +
          `**4. Structured search query** — ${STRUCTURED_SEARCH_OPENAPI_SECTION}\n\n` +
          `${STRUCTURED_SEARCH_POST_OPENAPI_NOTE}`,
        security: [{ ApiKeyAuth: [] }],
        body: {
          type: "object",
          description:
            "Exactly one of `query` or `selectedCandidate` must be present. `query` is a URL or search string; `selectedCandidate` completes a prior disambiguation round.",
          properties: {
            query: {
              type: "string",
              minLength: 1,
              maxLength: 500,
              description: "Streaming-service URL, free-text query, genre-discovery query, or structured search query.",
              examples: [
                "https://open.spotify.com/track/2WfaOiMkCvy7F5fcp2zZ8L",
                "bohemian rhapsody queen",
                "genre: jazz|r&b, tracks: 20, vibe: mixed",
                "title: Karma Police, artist: Radiohead, album: OK Computer, count: 5",
              ],
            },
            selectedCandidate: {
              type: "string",
              minLength: 1,
              maxLength: 200,
              description:
                "Opaque `candidates[].id` value from a previous `ResolveDisambiguation` response. Pass it unchanged and omit `query`.",
              example: "spotify:2WfaOiMkCvy7F5fcp2zZ8L",
            },
          } satisfies Record<keyof ResolveRequest, object>,
          oneOf: [{ required: ["query"] }, { required: ["selectedCandidate"] }],
          additionalProperties: false,
          examples: [
            { query: "https://open.spotify.com/track/2WfaOiMkCvy7F5fcp2zZ8L" },
            { query: "title: Karma Police, artist: Radiohead, album: OK Computer, count: 5" },
            { selectedCandidate: "spotify:2WfaOiMkCvy7F5fcp2zZ8L" },
          ],
        },
        response: {
          200: RESOLVE_SUCCESS_RESPONSE_SCHEMA,
          400: {
            description: "Invalid URL, invalid genre query, invalid structured search query, or malformed body.",
            $ref: "ErrorResponse#",
          },
          401: { description: "Missing, invalid, or revoked API key.", $ref: "ErrorResponse#" },
          404: {
            description:
              "The URL is valid but its track, album or artist could not be found, or a text or structured search found nothing on any service (`MC-RES-0004`).",
            $ref: "ErrorResponse#",
          },
          408: { description: "Upstream service timed out before a match could be confirmed.", $ref: "ErrorResponse#" },
          429: {
            description:
              "The issued API key exceeded its assigned rolling `60`-second or rolling `24`-hour quota. Inspect `context` and `Retry-After` before retrying.",
            $ref: "ErrorResponse#",
          },
          500: {
            description: "Unexpected server error. Use `errorId` from the response when reporting the failure.",
            $ref: "ErrorResponse#",
          },
          503: {
            description:
              "A service needed to resolve this request is currently unavailable. Retry after a delay; if the response repeats, report its `errorId`.",
            $ref: "ErrorResponse#",
          },
        },
      },
    },
    async (request, reply) => {
      // Per-visitor rate limiting for the site's own resolves, which the BFF
      // sends with the visitor's forwarded address. Token-authenticated
      // clients (request.apiClient set by authenticatePublic) skip it: their
      // identity is the client, whose own per-minute/per-day quota was already
      // enforced centrally in the auth hook (MC-088).
      if (!request.apiClient) {
        const rateLimit = siteResolveRateLimiter.check(request.ip);
        if (rateLimit.limited) {
          return sendRateLimitError(reply, rateLimit);
        }
      }

      return respondToResolveRequest(reply, request.body as ResolveRequest, request.headers.origin);
    },
  );
}

/**
 * The 200 response of a resolve, shared by `POST /api/v1/resolve` and the
 * Apple app's `POST /api/app/resolve` so both serialize a result the same way.
 */
export const RESOLVE_SUCCESS_RESPONSE_SCHEMA = {
  description:
    "A persisted `UnifiedResolveSuccess` selected by `type`, a `ResolveDisambiguation` list with `status` equal to `disambiguation`, or a genre result with `status` equal to `genre-search` or `genre-browse`.",
  oneOf: [
    { $ref: "UnifiedResolveSuccess#" },
    { $ref: "ResolveDisambiguation#" },
    { $ref: "GenreSearchResponse#" },
    { $ref: "GenreBrowseResponse#" },
  ],
} as const;

/**
 * Resolves a request body and answers it, after the caller has authenticated
 * and rate-limited the request in whatever way its route requires.
 *
 * This is the whole of `POST /api/v1/resolve` past its rate limit, and the
 * Apple app's route runs it unchanged, so the two can only differ in who may
 * call them.
 *
 * @param reply - The reply to answer on.
 * @param body - The body as the route's schema admitted it.
 * @param headerOrigin - The request's `Origin` header, which picks the short link's origin through `shortUrlOrigin`.
 * @returns The sent reply.
 * @throws Whatever the resolvers throw other than a {@link ResolveError},
 *   which the global error handler turns into a classified response.
 */
export async function respondToResolveRequest(
  reply: FastifyReply,
  body: ResolveRequest,
  headerOrigin: string | undefined,
): Promise<FastifyReply> {
  // Schema guarantees the object shape and length caps; we still trim
  // so downstream code never sees pure-whitespace input treated as valid.
  const query = body.query?.trim();
  const selectedCandidate = body.selectedCandidate?.trim();

  if (!query && !selectedCandidate) {
    return reply.status(400).send(
      createApiErrorResponse("INVALID_URL", {
        overrideMessage: "The 'query' or 'selectedCandidate' field is required.",
      }),
    );
  }

  try {
    const origin = shortUrlOrigin(headerOrigin);

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
          return reply.status(503).send(createApiErrorResponse("SERVICE_DOWN", { overrideMessage: err.message }));
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
          return reply.status(400).send(createApiErrorResponse("INVALID_URL", { overrideMessage: err.message }));
        }
        if (err instanceof NoGenreSearchAdapterError) {
          return reply.status(503).send(createApiErrorResponse("SERVICE_DOWN", { overrideMessage: err.message }));
        }
        log.error("GenreSearch", err instanceof Error ? err.message : "Unknown error");
        if (process.env.NODE_ENV !== "production" && err instanceof Error) {
          log.error("GenreSearch", "Stack:", err.stack);
        }
        return reply.status(503).send(createApiErrorResponse("SERVICE_DOWN"));
      }
    }

    // Flow 0.5: structured search (`title:`/`artist:`/`album:`). Routes
    // through the existing `resolveTextSearchWithDisambiguation` flow with
    // a parsed `SearchQuery` so adapters can use field operators where
    // supported (Spotify, Deezer, MusicBrainz). Disambiguation is returned
    // as the standard discriminated-union response.
    if (query && isStructuredSearchQuery(query)) {
      const parsed = parseStructuredQueryOrReply(query, reply);
      if (!parsed) return reply;
      const textResult = await resolveTextSearchWithDisambiguation(query, parsed.search, parsed.candidateLimit);
      if (textResult.kind === "resolved" && textResult.result) {
        return reply.send(await persistTrackAndRespond(textResult.result, origin));
      }
      return reply.send(toDisambiguationResponse(textResult.candidates));
    }

    if (selectedCandidate) {
      // Flow 1: completing a previous disambiguation. The candidate
      // string came from the client's earlier disambiguation response,
      // so no input classification is needed here.
      const result = await resolveSelectedCandidate(selectedCandidate);
      return reply.send(await persistTrackAndRespond(result, origin));
    }

    if (isUrl(query!)) {
      // Flow 2: the URL is routed by what it points at, as on the GET operation.
      return reply.send(await resolveUrlAndRespond(query!, origin));
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
    return reply.send(toDisambiguationResponse(textResult.candidates));
  } catch (error) {
    if (error instanceof ResolveError) {
      return sendResolveError(reply, error);
    }

    throw error;
  }
}

/**
 * Maps resolver-internal candidates to the documented public API shape.
 * Resolver ranking metadata must not leak into this strict response schema.
 */
function toDisambiguationResponse(
  candidates: ResolveDisambiguationResponse["candidates"] | undefined,
): ResolveDisambiguationResponse {
  return {
    status: "disambiguation",
    candidates: (candidates ?? []).map(({ id, title, artists, albumName, artworkUrl }) => ({
      id,
      title,
      artists,
      ...(albumName === undefined ? {} : { albumName }),
      ...(artworkUrl === undefined ? {} : { artworkUrl }),
    })),
  };
}
