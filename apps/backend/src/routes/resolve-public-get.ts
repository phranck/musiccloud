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
import { isExpiredDeezerPreviewUrl } from "../lib/preview-url.js";
import { ResolveError } from "../lib/resolve/errors.js";
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
  app.get(ENDPOINTS.v1.resolve, async (request, reply) => {
    // Without a JWT preHandler in front of this route, the IP-based rate
    // limiter is the primary abuse defense. Note: the effective key is
    // whatever Fastify resolves as `request.ip`, which depends on proxy
    // configuration: behind a reverse proxy without `trustProxy`, all
    // clients will share one key.
    const clientIp = request.ip;
    if (apiRateLimiter.isLimited(clientIp)) {
      return reply.status(429).send(jsonError("RATE_LIMITED"));
    }

    const queryParams = request.query as { query?: string; format?: string };
    const query = queryParams.query?.trim();
    const format = queryParams.format?.toLowerCase() ?? "json";

    if (!query) {
      return reply.status(400).send(jsonError("INVALID_URL", "The 'query' parameter is required."));
    }

    // Upper bound on input size. No legitimate track title / artist / URL
    // combination reaches 500 chars; the cap exists to stop pathological
    // inputs from reaching the FTS5 text search in resolver.ts.
    if (query.length > 500) {
      return reply.status(400).send(jsonError("INVALID_URL", "Query must be 500 characters or fewer."));
    }

    if (!["json", "text"].includes(format)) {
      return reply.status(400).send(jsonError("INVALID_URL", "Format must be 'json' or 'text'."));
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
        return reply
          .status(getErrorEntry(error.code).httpStatus)
          .send(jsonError(error.code, error.message || undefined, error.context));
      }

      log.error("ResolvePublicGet", "Unexpected error:", error instanceof Error ? error.message : "Unknown error");
      // Stack traces stay out of production logs per the project security
      // rules; they are invaluable locally but a disclosure risk in prod.
      if (process.env.NODE_ENV !== "production" && error instanceof Error) {
        log.error("ResolvePublicGet", "Stack:", error.stack);
      }
      return reply.status(500).send(jsonError("NETWORK_ERROR"));
    }
  });
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
        await repo.updatePreviewUrl(trackId, deezerTrack.previewUrl);
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
