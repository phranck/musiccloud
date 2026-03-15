import type { AlbumResolveSuccessResponse, ErrorCode, ResolveErrorResponse } from "@musiccloud/shared";
import { ERROR_STATUS_MAP, USER_MESSAGES } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { getRepository } from "../db/index.js";
import { log } from "../lib/infra/logger.js";
import { apiRateLimiter } from "../lib/infra/rate-limiter.js";
import { isAlbumUrl, stripTrackingParams } from "../lib/platform/url.js";
import { ResolveError } from "../lib/resolve/errors.js";
import type { AlbumResolutionResult } from "../services/album-resolver.js";
import { resolveAlbumTextSearch, resolveAlbumUrl } from "../services/album-resolver.js";

const ALLOWED_ORIGINS = ["https://musiccloud.io", "http://localhost:4321", "http://localhost:4322"];

export default async function resolveAlbumRoutes(app: FastifyInstance) {
  app.post("/api/v1/resolve-album", async (request, reply) => {
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

      // Route: album URL or text search
      const result = isAlbumUrl(query) ? await resolveAlbumUrl(query) : await resolveAlbumTextSearch(query);

      return reply.send(await persistAndRespond(result, origin));
    } catch (error) {
      if (error instanceof ResolveError) {
        const code = error.code as ErrorCode;
        const status = ERROR_STATUS_MAP[code] ?? 500;
        return reply.status(status).send(jsonError(code, status, error.message));
      }

      log.error("ResolveAlbum", "Unexpected error:", error instanceof Error ? error.message : "Unknown error");
      if (process.env.NODE_ENV !== "production" && error instanceof Error) {
        log.error("ResolveAlbum", "Stack:", error.stack);
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

async function persistAndRespond(result: AlbumResolutionResult, origin: string): Promise<AlbumResolveSuccessResponse> {
  const repo = await getRepository();

  // Deezer preview fallback: if source has no topTrackPreviewUrl, use one from Deezer link
  let previewUrl = result.sourceAlbum.topTrackPreviewUrl;
  if (!previewUrl) {
    const deezerLink = result.links.find((l) => l.service === "deezer" && l.topTrackPreviewUrl);
    if (deezerLink?.topTrackPreviewUrl) previewUrl = deezerLink.topTrackPreviewUrl;
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

  const shortUrl = `${origin}/${shortId}`;

  return {
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
