import type { ArtistResolveSuccessResponse, ErrorCode, ResolveErrorResponse } from "@musiccloud/shared";
import { ERROR_STATUS_MAP, USER_MESSAGES } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { getRepository } from "../db/index.js";
import { log } from "../lib/infra/logger.js";
import { apiRateLimiter } from "../lib/infra/rate-limiter.js";
import { isArtistUrl, stripTrackingParams } from "../lib/platform/url.js";
import { ResolveError } from "../lib/resolve/errors.js";
import type { ArtistResolutionResult } from "../services/artist-resolver.js";
import { resolveArtistTextSearch, resolveArtistUrl } from "../services/artist-resolver.js";

const ALLOWED_ORIGINS = ["https://musiccloud.io", "http://localhost:4321", "http://localhost:4322"];

export default async function resolveArtistRoutes(app: FastifyInstance) {
  app.post("/api/v1/resolve-artist", async (request, reply) => {
    // Rate limiting
    const clientIp = request.ip;
    if (apiRateLimiter.isLimited(clientIp)) {
      return reply.status(429).send(jsonError("RATE_LIMITED", 429));
    }

    // Parse body
    const body = request.body as { query?: string } | null;
    if (!body) {
      return reply
        .status(400)
        .send(jsonError("INVALID_URL", 400, "Request body must be valid JSON with a 'query' field."));
    }

    const query = body.query?.trim();

    if (!query) {
      return reply.status(400).send(jsonError("INVALID_URL", 400, "The 'query' field is required."));
    }

    if (query.length > 500) {
      return reply.status(400).send(jsonError("INVALID_URL", 400, "Query must be 500 characters or fewer."));
    }

    try {
      const origin = getOrigin(request.headers.origin);

      // Route: artist URL or text search
      const result = isArtistUrl(query) ? await resolveArtistUrl(query) : await resolveArtistTextSearch(query);

      return reply.send(await persistAndRespond(result, origin));
    } catch (error) {
      if (error instanceof ResolveError) {
        const code = error.code as ErrorCode;
        const status = ERROR_STATUS_MAP[code] ?? 500;
        return reply.status(status).send(jsonError(code, status, error.message));
      }

      log.error("ResolveArtist", "Unexpected error:", error instanceof Error ? error.message : "Unknown error");
      if (process.env.NODE_ENV !== "production" && error instanceof Error) {
        log.error("ResolveArtist", "Stack:", error.stack);
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

async function persistAndRespond(
  result: ArtistResolutionResult,
  origin: string,
): Promise<ArtistResolveSuccessResponse> {
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

  const shortUrl = `${origin}/${shortId}`;

  return {
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
