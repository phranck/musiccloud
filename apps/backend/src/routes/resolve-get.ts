/**
 * @file GET `/api/v1/resolve`, the one-request resolve for scripts.
 *
 * Meant for clients that want an answer from a single request and cannot hold
 * an interactive candidate-selection round: curl one-liners, Apple Shortcuts,
 * bookmarklets. It is registered inside the `authenticatePublic` scope in
 * `server.ts`, like `POST /api/v1/resolve`, because every call runs the full
 * resolver against the upstream services. The key it presents decides its
 * quota, which is the Developer Project's, and the auth plugin records its
 * usage. The route's `config.missingKeyMessage` is what a caller without a key
 * reads. It names the header and where a key comes from, so somebody whose
 * script sends no key can repair it from the response alone.
 *
 * Its POST counterpart in `routes/resolve.ts` serves the same clients plus the
 * frontend BFF, and supports interactive disambiguation, which this GET
 * endpoint does not (see Flow 2 below).
 *
 * Response shape is controlled by the `format` query parameter:
 * - `format=text`: plain-text short URL only. Designed for shell/scripting
 *   consumers that want a single pipeable string.
 * - `format=json` (or omitted): the full `UnifiedResolveSuccessResponse` for
 *   whichever kind the input pointed at, with its metadata and every resolved
 *   service link.
 */
import type { ResolveErrorResponse, UnifiedResolveSuccessResponse } from "@musiccloud/shared";
import { ENDPOINTS, getErrorEntry } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { DEVELOPER_PROJECTS_URL } from "../docs/developer-portal.js";
import {
  API_KEY_QUOTA_EXCEEDED_DESCRIPTION,
  API_KEY_REJECTED_DESCRIPTION,
  publicErrorResponse,
} from "../docs/public-response-schema.js";
import { STRUCTURED_SEARCH_GET_OPENAPI_NOTE, STRUCTURED_SEARCH_OPENAPI_SECTION } from "../docs/resolve-openapi.js";
import { requireEnvList } from "../lib/env.js";
import { createApiErrorResponse } from "../lib/infra/api-errors.js";
import { isAlbumUrl, isArtistUrl, isUrl, stripTrackingParams } from "../lib/platform/url.js";
import { ResolveError } from "../lib/resolve/errors.js";
import { buildCodeSamples } from "../schemas/openapi-code-samples.js";
import { resolveAlbumUrl } from "../services/album-resolver.js";
import { resolveArtistUrl } from "../services/artist-resolver.js";
import {
  persistAlbumAndRespond,
  persistArtistAndRespond,
  persistTrackAndRespond,
} from "../services/resolve-response.js";
import type { ResolutionResult } from "../services/resolver.js";
import { expandShortLink, resolveQuery, resolveTextSearchWithDisambiguation } from "../services/resolver.js";
import {
  isStructuredSearchQuery,
  type ParsedStructuredQuery,
  parseStructuredSearchQuery,
  StructuredSearchQueryParseError,
} from "../services/structured-search/index.js";

/**
 * Whitelist for the `Origin` header used when building the user-facing short
 * URL. The `Origin` header is client-controlled, so an attacker could supply
 * any hostname; if echoed back unchecked, the returned `shortUrl` would point
 * at an attacker-chosen host that a consumer might then share publicly.
 *
 * Sourced from env `ALLOWED_ORIGINS` (comma-separated). Keep this list and
 * the one in `routes/resolve.ts` synchronized via a single env var.
 */
const ALLOWED_ORIGINS = requireEnvList("ALLOWED_ORIGINS");

/**
 * What a request without a key reads. `authenticatePublic` sends it through
 * this route's `config.missingKeyMessage`. It names the header, says where a
 * key comes from, and says that nothing else about the operation changed,
 * because the caller reading it is most likely a script that sends no key and
 * is otherwise correct.
 */
const MISSING_KEY_MESSAGE =
  "GET /api/v1/resolve now requires an API key, sent in the X-API-Key header. " +
  `Create a project and a key at ${DEVELOPER_PROJECTS_URL}. ` +
  "Nothing else about this operation has changed, so the same request with the header returns the same response.";

/**
 * Registers `GET /api/v1/resolve`.
 *
 * Has to be registered inside the scope whose `preHandler` is
 * `authenticatePublic`, because the handler itself checks no credential and
 * relies on that guard for the key, the project quota and the usage event.
 *
 * @param app - The protected scope the route joins.
 */
export default async function resolveGetRoutes(app: FastifyInstance) {
  app.get(
    ENDPOINTS.v1.resolve,
    {
      config: { missingKeyMessage: MISSING_KEY_MESSAGE },
      schema: {
        tags: ["Resolve"],
        summary: "Resolve a music URL or query in one request (GET)",
        "x-codeSamples": buildCodeSamples({
          method: "GET",
          path: "/api/v1/resolve",
          auth: "apiKey",
          query: { query: "https://open.spotify.com/track/2WfaOiMkCvy7F5fcp2zZ8L" },
        }),
        description:
          "One-request companion to `POST /api/v1/resolve`, suitable for command-line tools, shortcuts, and other clients that do not need an interactive candidate-selection round.\n\n" +
          "Send an API key issued to an application in the `X-API-Key` header, as for `POST /api/v1/resolve`. Requests count against your Developer Project's quota like every other call made with one of its keys. A request without a key receives `401`, and its `message` names the header and where a key comes from.\n\n" +
          "Accepts:\n\n" +
          "- **Streaming-service URL** (e.g. `https://open.spotify.com/track/...`)\n" +
          "- **Free-text query** (e.g. `bohemian rhapsody queen`)\n" +
          `- **Structured search query** — ${STRUCTURED_SEARCH_OPENAPI_SECTION}\n\n` +
          `${STRUCTURED_SEARCH_GET_OPENAPI_NOTE}\n\n` +
          "A successful request persists what it resolved and returns either `UnifiedResolveSuccess` or its canonical share URL. A URL is routed by what it points at, so a track, an album and an artist URL each return the matching variant, discriminated on `type`. Malformed input, ambiguous text, or text with no unambiguous match returns `400`. A valid streaming-service URL whose item cannot be found returns `404`.\n\n" +
          "`genre:` discovery queries are not supported because they return candidate lists. Send those queries to `POST /api/v1/resolve`.",
        security: [{ ApiKeyAuth: [] }],
        querystring: {
          type: "object",
          required: ["query"],
          properties: {
            query: {
              type: "string",
              minLength: 1,
              maxLength: 500,
              description:
                "Streaming-service URL, free-text query, or structured search query (e.g. `title: Bohemian Rhapsody, artist: Queen`).",
              examples: [
                "https://open.spotify.com/track/2WfaOiMkCvy7F5fcp2zZ8L",
                "bohemian rhapsody queen",
                "title: Karma Police, artist: Radiohead, album: OK Computer, count: 5",
              ],
            },
            format: {
              type: "string",
              enum: ["json", "text"],
              default: "json",
              description:
                "`json` returns the full response; `text` returns the short URL as plain text.\n\n**Default**: `json`.",
            },
          },
          additionalProperties: false,
        },
        response: {
          200: {
            description:
              "With `format=json` or no format, returns `UnifiedResolveSuccess`, discriminated on `type` into `track`, `album` or `artist`. With `format=text`, returns only the canonical share URL as UTF-8 plain text, whichever kind was resolved.",
            content: {
              "application/json": { schema: { $ref: "UnifiedResolveSuccess#" } },
              "text/plain": {
                schema: {
                  type: "string",
                  format: "uri",
                  description: "Canonical musiccloud share URL for whatever was resolved.",
                },
              },
            },
          },
          400: {
            description: "The query is missing or malformed, or a text search did not produce one unambiguous match.",
            $ref: "ErrorResponse#",
          },
          401: publicErrorResponse(
            `${API_KEY_REJECTED_DESCRIPTION} Without any key, \`message\` names the \`X-API-Key\` header and where a key comes from.`,
          ),
          404: {
            description: "The query is a valid streaming-service URL, but the referenced track could not be found.",
            $ref: "ErrorResponse#",
          },
          408: { description: "Upstream service timed out.", $ref: "ErrorResponse#" },
          429: publicErrorResponse(API_KEY_QUOTA_EXCEEDED_DESCRIPTION),
          500: {
            description: "Unexpected server error. Use `errorId` from the response when reporting the failure.",
            $ref: "ErrorResponse#",
          },
          503: { description: "Required upstream service is unavailable.", $ref: "ErrorResponse#" },
        },
      },
    },
    async (request, reply) => {
      // Schema guarantees presence, type, and length caps of the query string
      // fields. Trim post-validation so a pure-whitespace query does not reach
      // the resolver.
      const queryParams = request.query as { query: string; format?: "json" | "text" };
      const query = queryParams.query.trim();
      const format = queryParams.format ?? "json";

      // All three answers carry the same payload, so the format decision is
      // made once here rather than repeated at each of them.
      const respond = (payload: UnifiedResolveSuccessResponse) =>
        format === "text" ? reply.type("text/plain").send(payload.shortUrl) : reply.send(payload);

      if (!query) {
        return reply.status(400).send(jsonError("INVALID_URL", "The 'query' parameter is required."));
      }

      try {
        const origin = getOrigin(request.headers.origin);

        let result: ResolutionResult;
        if (isUrl(query)) {
          // Flow 1: input is a streaming-service URL. Content-type routing
          // mirrors the POST handler, because the same input has to reach the
          // same resolver from either operation. The short link is expanded
          // first: the path shape that tells an album from an artist from a
          // track exists only in the expanded URL.
          const expanded = await expandShortLink(stripTrackingParams(query));
          const cleanUrl = stripTrackingParams(expanded);
          if (isAlbumUrl(cleanUrl)) {
            return respond(await persistAlbumAndRespond(await resolveAlbumUrl(cleanUrl), origin));
          }
          if (isArtistUrl(cleanUrl)) {
            return respond(await persistArtistAndRespond(await resolveArtistUrl(cleanUrl), origin));
          }
          result = await resolveQuery(query, expanded);
        } else if (isStructuredSearchQuery(query)) {
          // Flow 1.5: structured search. Stateless GET cannot disambiguate, so
          // ambiguous results return 400 (same trade-off as the free-text path).
          let parsed: ParsedStructuredQuery;
          try {
            parsed = parseStructuredSearchQuery(query);
          } catch (err) {
            if (err instanceof StructuredSearchQueryParseError) {
              return reply.status(400).send(jsonError("INVALID_URL", err.message));
            }
            throw err;
          }
          const textResult = await resolveTextSearchWithDisambiguation(query, parsed.search, parsed.candidateLimit);
          if (textResult.kind === "resolved" && textResult.result) {
            result = textResult.result;
          } else {
            return reply
              .status(400)
              .send(jsonError("INVALID_URL", "Structured query was ambiguous; use POST endpoint for disambiguation."));
          }
        } else {
          // Flow 2: free-text search. The POST endpoint (resolve.ts) can
          // return a `disambiguation` kind with multiple candidates for an
          // interactive client to choose from. A stateless GET cannot carry
          // that follow-up round-trip, so here we accept only the unambiguous
          // `resolved` outcome and 400 on anything else. This is the
          // deliberate trade-off for the one-shot nature of this endpoint.
          const textResult = await resolveTextSearchWithDisambiguation(query);
          if (textResult.kind === "resolved" && textResult.result) {
            result = textResult.result;
          } else {
            return reply.status(400).send(jsonError("INVALID_URL", "Could not resolve this query."));
          }
        }

        return respond(await persistTrackAndRespond(result, origin));
      } catch (error) {
        // Domain errors from the resolver carry their own HTTP status in the
        // shared error table (`getErrorEntry`), so we forward those faithfully
        // with a user-facing message. Anything else is an unexpected bug and
        // collapses to a generic 500 so we do not leak internals to the
        // caller.
        if (error instanceof ResolveError) {
          const httpStatus = getErrorEntry(error.code).httpStatus as 400 | 404 | 408 | 429 | 500 | 503;
          return reply.status(httpStatus).send(jsonError(error.code, error.message || undefined, error.context));
        }

        throw error;
      }
    },
  );
}

/**
 * Picks a safe origin for the user-facing short URL. Accepts the request's
 * `Origin` header only if it is in the whitelist; falls back to the canonical
 * production origin otherwise. See `ALLOWED_ORIGINS` for why this matters.
 *
 * @param headerOrigin - raw `Origin` header value from the incoming request, if any
 * @returns a whitelisted origin string, guaranteed safe to embed in the response
 */
function getOrigin(headerOrigin?: string): string {
  if (headerOrigin && ALLOWED_ORIGINS.includes(headerOrigin)) {
    return headerOrigin;
  }
  // First entry is the production origin; treated as the canonical default
  // whenever the request lacks a trusted origin (curl, Shortcuts, spoofed).
  return ALLOWED_ORIGINS[0];
}

/**
 * Builds the wire-format error object. The `code` is resolved against the
 * shared error table so the HTTP status and user-facing message stay
 * consistent between backend, frontend, and external clients. `context` is
 * used for placeholder interpolation in the localized message template.
 *
 * @param code            - canonical error code from the shared error table (e.g. `INVALID_URL`, `RATE_LIMITED`)
 * @param overrideMessage - optional human message that replaces the template output (used for caller-specific wording)
 * @param context         - values interpolated into the message template when no override is given
 * @returns `ResolveErrorResponse` ready to send as the JSON body
 */
function jsonError(
  code: string,
  overrideMessage?: string,
  context?: Record<string, string | number>,
): ResolveErrorResponse {
  return createApiErrorResponse(code, { context, overrideMessage });
}
