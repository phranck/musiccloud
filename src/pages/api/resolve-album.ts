import type { APIRoute } from "astro";
import { getRepository } from "../../db/index.js";
import type { AlbumResolveSuccessResponse, ResolveErrorResponse } from "@/lib/types/api";
import type { ErrorCode } from "@/lib/resolve/errors";
import { ERROR_STATUS_MAP, ResolveError, USER_MESSAGES } from "@/lib/resolve/errors";
import { log } from "@/lib/infra/logger";
import { apiRateLimiter } from "@/lib/infra/rate-limiter";
import { stripTrackingParams } from "@/lib/platform/url";
import { isAlbumUrl } from "@/lib/platform/url";
import type { AlbumResolutionResult } from "../../services/album-resolver.js";
import { resolveAlbumTextSearch, resolveAlbumUrl } from "../../services/album-resolver.js";

const ALLOWED_ORIGINS = ["https://musiccloud.io", "http://localhost:4321", "http://localhost:4322"];

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  // Rate limiting (shared with /api/resolve)
  const clientIp = clientAddress ?? "unknown";
  if (apiRateLimiter.isLimited(clientIp)) {
    return jsonError("RATE_LIMITED", 429);
  }

  // Parse body
  let body: { query?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError("INVALID_URL", 400, "Request body must be valid JSON with a 'query' field.");
  }

  const query = body.query?.trim();

  if (!query) {
    return jsonError("INVALID_URL", 400, "The 'query' field is required.");
  }

  if (query.length > 500) {
    return jsonError("INVALID_URL", 400, "Query must be 500 characters or fewer.");
  }

  try {
    // Validate origin against whitelist for short URL generation
    const requestOrigin = new URL(request.url).origin;
    const origin = ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0];

    // Route: album URL → resolveAlbumUrl, text → resolveAlbumTextSearch
    const result = isAlbumUrl(query)
      ? await resolveAlbumUrl(query)
      : await resolveAlbumTextSearch(query);

    return await persistAndRespond(result, origin);
  } catch (error) {
    if (error instanceof ResolveError) {
      const code = error.code as ErrorCode;
      const status = ERROR_STATUS_MAP[code] ?? 500;
      return jsonError(code, status, error.message);
    }

    log.error("ResolveAlbum", "Unexpected error:", error instanceof Error ? error.message : "Unknown error");
    if (import.meta.env.DEV && error instanceof Error) {
      log.error("ResolveAlbum", "Stack:", error.stack);
    }
    return jsonError("NETWORK_ERROR", 500);
  }
};

function jsonError(code: ErrorCode, status: number, customMessage?: string): Response {
  const body: ResolveErrorResponse = {
    error: code,
    message: customMessage ?? USER_MESSAGES[code] ?? "Something went wrong.",
  };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function persistAndRespond(result: AlbumResolutionResult, origin: string): Promise<Response> {
  const repo = await getRepository();

  const { albumId, shortId } = await repo.persistAlbumWithLinks({
    sourceAlbum: {
      ...result.sourceAlbum,
      sourceUrl: result.sourceAlbum.webUrl,
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

  const body: AlbumResolveSuccessResponse = {
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
    },
    links: result.links.map((l) => ({
      service: l.service,
      displayName: l.displayName,
      url: stripTrackingParams(l.url),
      confidence: l.confidence,
      matchMethod: l.matchMethod,
    })),
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
