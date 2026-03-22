import type { ErrorCode, ResolveErrorResponse, ResolveSuccessResponse } from "@musiccloud/shared";
import { ERROR_STATUS_MAP, USER_MESSAGES } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { getRepository } from "../db/index.js";
import { log } from "../lib/infra/logger.js";
import { apiRateLimiter } from "../lib/infra/rate-limiter.js";
import { isUrl, stripTrackingParams } from "../lib/platform/url.js";
import { isExpiredDeezerPreviewUrl } from "../lib/preview-url.js";
import { ResolveError } from "../lib/resolve/errors.js";
import { deezerAdapter } from "../services/adapters/deezer.js";
import type { ResolutionResult } from "../services/resolver.js";
import { resolveQuery, resolveTextSearchWithDisambiguation } from "../services/resolver.js";

const ALLOWED_ORIGINS = ["https://musiccloud.io", "http://localhost:4321", "http://localhost:4322"];

/**
 * Public GET endpoint: /api/v1/resolve?query=...&format=text|json
 * - format=text: returns plain text Short URL
 * - format=json or omitted: returns full JSON response
 */
export default async function resolvePublicGetRoutes(app: FastifyInstance) {
  app.get("/api/v1/resolve", async (request, reply) => {
    // Rate limiting
    const clientIp = request.ip;
    if (apiRateLimiter.isLimited(clientIp)) {
      return reply.status(429).send(jsonError("RATE_LIMITED", 429));
    }

    // Parse query parameters
    const queryParams = request.query as { query?: string; format?: string };
    const query = queryParams.query?.trim();
    const format = queryParams.format?.toLowerCase() ?? "json";

    if (!query) {
      return reply.status(400).send(jsonError("INVALID_URL", 400, "The 'query' parameter is required."));
    }

    if (query.length > 500) {
      return reply.status(400).send(jsonError("INVALID_URL", 400, "Query must be 500 characters or fewer."));
    }

    if (!["json", "text"].includes(format)) {
      return reply.status(400).send(jsonError("INVALID_URL", 400, "Format must be 'json' or 'text'."));
    }

    try {
      const origin = getOrigin(request.headers.origin);

      // Flow 1: URL input - resolve directly
      let result: ResolutionResult;
      if (isUrl(query)) {
        result = await resolveQuery(query);
      } else {
        // Flow 2: Text search (no disambiguation for GET endpoint - return first match)
        const textResult = await resolveTextSearchWithDisambiguation(query);
        if (textResult.kind === "resolved" && textResult.result) {
          result = textResult.result;
        } else {
          return reply.status(400).send(jsonError("INVALID_URL", 400, "Could not resolve this query."));
        }
      }

      const response = await persistAndRespond(result, origin);

      // Return based on format parameter
      if (format === "text") {
        return reply.type("text/plain").send(response.shortUrl);
      }

      return reply.send(response);
    } catch (error) {
      if (error instanceof ResolveError) {
        const code = error.code as ErrorCode;
        const status = ERROR_STATUS_MAP[code] ?? 500;
        return reply.status(status).send(jsonError(code, status, error.message));
      }

      log.error("ResolvePublicGet", "Unexpected error:", error instanceof Error ? error.message : "Unknown error");
      if (process.env.NODE_ENV !== "production" && error instanceof Error) {
        log.error("ResolvePublicGet", "Stack:", error.stack);
      }
      return reply.status(500).send(jsonError("NETWORK_ERROR", 500));
    }
  });
}

function getOrigin(headerOrigin?: string): string {
  if (headerOrigin && ALLOWED_ORIGINS.includes(headerOrigin)) {
    return headerOrigin;
  }
  return ALLOWED_ORIGINS[0];
}

function jsonError(code: ErrorCode, _status: number, customMessage?: string): ResolveErrorResponse {
  return {
    error: code,
    message: customMessage ?? USER_MESSAGES[code] ?? "Something went wrong.",
  };
}

async function persistAndRespond(result: ResolutionResult, origin: string): Promise<ResolveSuccessResponse> {
  const repo = await getRepository();

  const { trackId, shortId } = await repo.persistTrackWithLinks({
    sourceTrack: {
      ...result.sourceTrack,
      sourceUrl: result.sourceTrack.webUrl,
    },
    links: result.links.map((l) => ({
      service: l.service,
      url: stripTrackingParams(l.url),
      confidence: l.confidence,
      matchMethod: l.matchMethod,
      externalId: l.externalId,
    })),
  });

  if (result.inputUrl) {
    try {
      await repo.addTrackUrlAlias(result.inputUrl, trackId);
    } catch {
      // Non-fatal
    }
  }

  // Refresh missing or expired Deezer preview URLs
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
