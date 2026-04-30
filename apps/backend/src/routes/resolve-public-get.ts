/**
 * @file Unauthenticated public GET endpoint for track resolves.
 *
 * Registered at the root scope in `server.ts` (outside the
 * `authenticatePublic` preHandler group) specifically so scripting consumers
 * can hit it without a JWT: Apple Shortcuts, curl one-liners, Bookmarklets,
 * and similar integrations that cannot participate in a Bearer-token flow.
 * Rate limiting per client IP (`apiRateLimiter`) is the primary abuse defense
 * in place of auth.
 *
 * Relationship to other resolve routes:
 * - `routes/resolve.ts`: POST counterpart for authenticated clients
 *   (frontend BFF, external API consumers). Supports interactive
 *   disambiguation; this GET endpoint does not (see Flow 2 below).
 * - `routes/url-redirect.ts`: also unauthenticated. Given a streaming-service
 *   URL it resolves and 302-redirects to `/<shortId>` on the frontend. Use
 *   this one when the consumer wants the data; use `url-redirect` when it
 *   just wants the user to land on the share page.
 *
 * Response shape is controlled by the `format` query parameter:
 * - `format=text`: plain-text short URL only. Designed for shell/scripting
 *   consumers that want a single pipeable string.
 * - `format=json` (or omitted): full `ResolveSuccessResponse` with track
 *   metadata and all resolved service links.
 */
import type { ResolveErrorResponse, ResolveSuccessResponse } from "@musiccloud/shared";
import { ENDPOINTS, formatUserMessage, getErrorEntry } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { getRepository } from "../db/index.js";
import { log } from "../lib/infra/logger.js";
import { apiRateLimiter } from "../lib/infra/rate-limiter.js";
import { isUrl, stripTrackingParams } from "../lib/platform/url.js";
import { getPreviewExpiry, isExpiredDeezerPreviewUrl } from "../lib/preview-url.js";
import { ResolveError } from "../lib/resolve/errors.js";
import { buildCodeSamples } from "../schemas/openapi-code-samples.js";
import { deezerAdapter } from "../services/plugins/deezer/adapter.js";
import type { ResolutionResult } from "../services/resolver.js";
import { resolveQuery, resolveTextSearchWithDisambiguation } from "../services/resolver.js";

/**
 * Whitelist for the `Origin` header used when building the user-facing short
 * URL. The `Origin` header is client-controlled, so an attacker could supply
 * any hostname; if echoed back unchecked, the returned `shortUrl` would point
 * at an attacker-chosen host that a consumer might then share publicly.
 *
 * Note: this list is duplicated in `routes/resolve.ts`. Keep the two in sync
 * whenever an origin is added or removed.
 */
const ALLOWED_ORIGINS = [
  "https://musiccloud.io",
  "http://localhost:3000",
  "http://localhost:4321",
  "http://localhost:4322",
];

export default async function resolvePublicGetRoutes(app: FastifyInstance) {
  app.get(
    ENDPOINTS.v1.resolve,
    {
      schema: {
        tags: ["Resolve"],
        summary: "Resolve a music URL or query (unauthenticated, GET)",
        "x-codeSamples": buildCodeSamples({
          method: "GET",
          path: "/api/v1/resolve",
          query: { query: "https://open.spotify.com/track/2WfaOiMkCvy7F5fcp2zZ8L" },
        }),
        description:
          "Unauthenticated companion to POST `/api/v1/resolve`, designed for scripting consumers (Apple Shortcuts, curl, bookmarklets). Rate-limited per client IP. Returns a resolved track or errors on ambiguous text searches (no interactive disambiguation over GET).",
        querystring: {
          type: "object",
          required: ["query"],
          properties: {
            query: {
              type: "string",
              minLength: 1,
              maxLength: 500,
              description: "Streaming-service URL or free-text query.",
            },
            format: {
              type: "string",
              enum: ["json", "text"],
              default: "json",
              description: "`json` returns the full response; `text` returns the short URL as plain text.",
            },
          },
          additionalProperties: false,
        },
        response: {
          200: {
            description:
              "Resolved track payload (when `format=json`, default); plain-text short URL (when `format=text`). Only the JSON shape is modelled here — `format=text` returns `text/plain`.",
            $ref: "ResolveSuccess#",
          },
          400: { description: "Missing, malformed, or ambiguous query.", $ref: "ErrorResponse#" },
          404: { description: "Query is valid but no track could be found.", $ref: "ErrorResponse#" },
          408: { description: "Upstream service timed out.", $ref: "ErrorResponse#" },
          429: { description: "Rate limit exceeded for this client IP (10/min).", $ref: "ErrorResponse#" },
          500: { description: "Unexpected server error.", $ref: "ErrorResponse#" },
          503: { description: "Required upstream service is unavailable.", $ref: "ErrorResponse#" },
        },
      },
    },
    async (request, reply) => {
      // Without a JWT preHandler in front of this route, the IP-based rate
      // limiter is the primary abuse defense. The effective bucket key is
      // whatever Fastify resolves as `request.ip`, which depends on the
      // Fastify `trustProxy` option (see server.ts). Production sets
      // TRUST_PROXY=1 so `request.ip` reads the X-Forwarded-For client IP
      // from the single Zerops ingress hop; with TRUST_PROXY unset all
      // clients behind the proxy share one bucket and 2-3 legitimate
      // requests trip the per-IP 30/60s limit for everyone.
      const clientIp = request.ip;
      if (apiRateLimiter.isLimited(clientIp)) {
        return reply.status(429).send(jsonError("RATE_LIMITED"));
      }

      // Schema guarantees presence, type, and length caps of the query string
      // fields. Trim post-validation so a pure-whitespace query does not reach
      // the resolver.
      const queryParams = request.query as { query: string; format?: "json" | "text" };
      const query = queryParams.query.trim();
      const format = queryParams.format ?? "json";

      if (!query) {
        return reply.status(400).send(jsonError("INVALID_URL", "The 'query' parameter is required."));
      }

      try {
        const origin = getOrigin(request.headers.origin);

        let result: ResolutionResult;
        if (isUrl(query)) {
          // Flow 1: input is a streaming-service URL. The resolver handles
          // cache lookup and cross-service expansion via adapters.
          result = await resolveQuery(query);
        } else {
          // Flow 2: free-text search. The POST endpoint (resolve.ts) can
          // return a `disambiguation` kind with multiple candidates for an
          // interactive client to choose from. A stateless GET cannot carry
          // that follow-up round-trip, so here we accept only the unambiguous
          // `resolved` outcome and 400 on anything else. This is the
          // deliberate trade-off for the unauth + one-shot nature of this
          // endpoint.
          const textResult = await resolveTextSearchWithDisambiguation(query);
          if (textResult.kind === "resolved" && textResult.result) {
            result = textResult.result;
          } else {
            return reply.status(400).send(jsonError("INVALID_URL", "Could not resolve this query."));
          }
        }

        const response = await persistAndRespond(result, origin);

        if (format === "text") {
          return reply.type("text/plain").send(response.shortUrl);
        }

        return reply.send(response);
      } catch (error) {
        // Domain errors from the resolver carry their own HTTP status in the
        // shared error table (`getErrorEntry`), so we forward those faithfully
        // with a user-facing message. Anything else is an unexpected bug and
        // collapses to a generic 500 so we do not leak internals to an
        // unauthenticated caller.
        if (error instanceof ResolveError) {
          const httpStatus = getErrorEntry(error.code).httpStatus as 400 | 404 | 408 | 429 | 500 | 503;
          return reply.status(httpStatus).send(jsonError(error.code, error.message || undefined, error.context));
        }

        log.error("ResolvePublicGet", "Unexpected error:", error instanceof Error ? error.message : "Unknown error");
        // Stack traces stay out of production logs per the project security
        // rules; they are invaluable locally but a disclosure risk in prod.
        if (process.env.NODE_ENV !== "production" && error instanceof Error) {
          log.error("ResolvePublicGet", "Stack:", error.stack);
        }
        return reply.status(500).send(jsonError("NETWORK_ERROR"));
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
  const entry = getErrorEntry(code);
  return {
    error: entry.code,
    message: formatUserMessage(entry.code, context, overrideMessage),
  };
}

/**
 * Persists the resolve result, opportunistically refreshes a stale preview URL,
 * and shapes the `ResolveSuccessResponse` returned to the caller.
 *
 * The name understates what happens: besides the DB write, this function is
 * also the place where a missing or expired Deezer preview URL gets refreshed
 * inline (see below). Keeping that side effect here means the response always
 * ships with a playable preview when one is obtainable, without requiring a
 * second round-trip from the frontend.
 *
 * @param result - resolver output (source track + cross-service links)
 * @param origin - already-validated origin used to mint the short URL
 * @returns the success payload: track metadata, canonical `shortUrl`
 *          (`<origin>/<shortId>`), and the full list of resolved service
 *          links. `track.previewUrl` is the refreshed Deezer preview when
 *          enrichment succeeded, otherwise the original (possibly absent or
 *          expired) value.
 */
async function persistAndRespond(result: ResolutionResult, origin: string): Promise<ResolveSuccessResponse> {
  const repo = await getRepository();

  const { trackId, shortId } = await repo.persistTrackWithLinks({
    sourceTrack: {
      ...result.sourceTrack,
      sourceUrl: result.sourceTrack.webUrl,
    },
    // stripTrackingParams runs on the persisted URL (so cached links stay
    // clean) AND on the response below: two separate write boundaries.
    links: result.links.map((l) => ({
      service: l.service,
      url: stripTrackingParams(l.url),
      confidence: l.confidence,
      matchMethod: l.matchMethod,
      externalId: l.externalId,
    })),
  });

  // Aggregate ISRCs observed across services (see migration 0019).
  // Non-fatal: write failure here must not turn a successful resolve
  // into an error response.
  if (result.externalIds.length > 0) {
    try {
      await repo.addTrackExternalIds(trackId, result.externalIds);
    } catch (err) {
      log.debug("ResolvePublicGet", "External-id persist failed:", err instanceof Error ? err.message : String(err));
    }
  }

  // `inputUrl` is set when the resolver expanded a short/redirect link (e.g.
  // link.deezer.com/s/…) to its canonical form. Remembering the original
  // lets a later request on that same short URL hit the cache. The alias is
  // a pure optimization, so a duplicate-insert or any other write failure
  // must not bubble up and turn a successful resolve into an error response.
  if (result.inputUrl) {
    try {
      await repo.addTrackUrlAlias(result.inputUrl, trackId);
    } catch {
      // Non-fatal: see comment above.
    }
  }

  // Deezer preview URLs are CDN-signed (`dzcdn.net?hdnea=exp=…`) and expire,
  // so a cached track can come back with a dead preview. When we have an
  // ISRC we can cheaply ask Deezer for a fresh one and update in place.
  // Deezer is the go-to here because it is keyless ("always available") and
  // has broad 30-second preview coverage. Fails are swallowed: a missing
  // preview is a soft UX regression, not a reason to fail the resolve.
  let previewUrl = result.sourceTrack.previewUrl ?? undefined;
  if (
    (!previewUrl || isExpiredDeezerPreviewUrl(previewUrl)) &&
    result.sourceTrack.isrc &&
    deezerAdapter.isAvailable()
  ) {
    try {
      const deezerTrack = await deezerAdapter.findByIsrc(result.sourceTrack.isrc);
      if (deezerTrack?.previewUrl) {
        const expiresAtMs = getPreviewExpiry(deezerTrack.previewUrl, "deezer");
        await repo.upsertTrackPreview(trackId, {
          service: "deezer",
          url: deezerTrack.previewUrl,
          expiresAt: expiresAtMs ? new Date(expiresAtMs) : null,
        });
        previewUrl = deezerTrack.previewUrl;
      }
    } catch (err) {
      log.debug(
        "ResolvePublicGet",
        "Deezer preview enrichment failed:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // `${origin}/${shortId}` is the canonical share URL. The resolver of that
  // path lives on the frontend (Astro `/:shortId`), not in the backend.
  const shortUrl = `${origin}/${shortId}`;

  return {
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
