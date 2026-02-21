import type { FastifyInstance } from "fastify";
import type {
  ResolveDisambiguationResponse,
  ResolveErrorResponse,
  ResolveSuccessResponse,
  ErrorCode,
} from "@musiccloud/shared";
import { ERROR_STATUS_MAP, USER_MESSAGES } from "@musiccloud/shared";
import { ResolveError } from "../lib/resolve/errors.js";
import { log } from "../lib/infra/logger.js";
import { apiRateLimiter } from "../lib/infra/rate-limiter.js";
import { isUrl, stripTrackingParams } from "../lib/platform/url.js";
import { getRepository } from "../db/index.js";
import type { ResolutionResult } from "../services/resolver.js";
import {
  resolveQuery,
  resolveSelectedCandidate,
  resolveTextSearchWithDisambiguation,
} from "../services/resolver.js";

const ALLOWED_ORIGINS = ["https://musiccloud.io", "http://localhost:4321", "http://localhost:4322"];

export default async function resolveRoutes(app: FastifyInstance) {
  app.post("/api/v1/resolve", async (request, reply) => {
    // Rate limiting
    const clientIp = request.ip;
    if (apiRateLimiter.isLimited(clientIp)) {
      return reply.status(429).send(jsonError("RATE_LIMITED", 429));
    }

    // Parse body
    const body = request.body as { query?: string; selectedCandidate?: string } | null;
    if (!body) {
      return reply.status(400).send(jsonError("INVALID_URL", 400, "Request body must be valid JSON with a 'query' field."));
    }

    const query = body.query?.trim();
    const selectedCandidate = body.selectedCandidate?.trim();

    if (!query && !selectedCandidate) {
      return reply.status(400).send(jsonError("INVALID_URL", 400, "The 'query' or 'selectedCandidate' field is required."));
    }

    if (query && query.length > 500) {
      return reply.status(400).send(jsonError("INVALID_URL", 400, "Query must be 500 characters or fewer."));
    }

    if (selectedCandidate && selectedCandidate.length > 200) {
      return reply.status(400).send(jsonError("INVALID_URL", 400, "Invalid candidate selection."));
    }

    try {
      const origin = getOrigin(request.headers.origin);

      // Flow 1: User selected a candidate from disambiguation list
      if (selectedCandidate) {
        const result = await resolveSelectedCandidate(selectedCandidate);
        return reply.send(await persistAndRespond(result, origin));
      }

      // Flow 2: URL input - resolve directly
      if (isUrl(query!)) {
        const result = await resolveQuery(query!);
        return reply.send(await persistAndRespond(result, origin));
      }

      // Flow 3: Text search with disambiguation
      const textResult = await resolveTextSearchWithDisambiguation(query!);

      if (textResult.kind === "resolved" && textResult.result) {
        return reply.send(await persistAndRespond(textResult.result, origin));
      }

      // Return disambiguation candidates (no DB persistence yet)
      const disambiguationBody: ResolveDisambiguationResponse = {
        status: "disambiguation",
        candidates: textResult.candidates ?? [],
      };
      return reply.send(disambiguationBody);
    } catch (error) {
      if (error instanceof ResolveError) {
        const code = error.code as ErrorCode;
        const status = ERROR_STATUS_MAP[code] ?? 500;
        return reply.status(status).send(jsonError(code, status, error.message));
      }

      log.error("Resolve", "Unexpected error:", error instanceof Error ? error.message : "Unknown error");
      if (process.env.NODE_ENV !== "production" && error instanceof Error) {
        log.error("Resolve", "Stack:", error.stack);
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

function jsonError(code: ErrorCode, status: number, customMessage?: string): ResolveErrorResponse {
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

  // If the original input was a short link, save it as an alias for fast future lookups
  if (result.inputUrl) {
    try {
      await repo.addTrackUrlAlias(result.inputUrl, trackId);
    } catch {
      // Non-fatal – alias saving failure must not break the response
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
      previewUrl: result.sourceTrack.previewUrl ?? undefined,
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
